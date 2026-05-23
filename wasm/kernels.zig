var heap: [16 * 1024 * 1024]u8 = undefined;
var offset: usize = 0;

fn alignForward(value: usize, alignment: usize) usize {
    return (value + alignment - 1) & ~(alignment - 1);
}

pub export fn alloc(size: usize) usize {
    const start = alignForward(offset, 16);
    const end = start + size;
    if (end > heap.len) return 0;
    offset = end;
    return @intFromPtr(&heap[start]);
}

pub export fn reset_alloc() void {
    offset = 0;
}

pub export fn dot_f32(left_ptr: [*]const f32, right_ptr: [*]const f32, len: usize) f32 {
    var total: f32 = 0;
    var index: usize = 0;
    while (index < len) : (index += 1) total += left_ptr[index] * right_ptr[index];
    return total;
}

pub export fn dense_relu_f32(inputs_ptr: [*]const f32, weights_ptr: [*]const f32, bias_ptr: [*]const f32, output_ptr: [*]f32, input_size: usize, output_size: usize) void {
    var output_index: usize = 0;
    while (output_index < output_size) : (output_index += 1) {
        var value: f32 = bias_ptr[output_index];
        const weight_offset = output_index * input_size;
        var input_index: usize = 0;
        while (input_index < input_size) : (input_index += 1) value += inputs_ptr[input_index] * weights_ptr[weight_offset + input_index];
        output_ptr[output_index] = if (value > 0) value else 0;
    }
}

// ─── NEAT sparse forward pass ────────────────────────────────────────────────
// Topology stored in static globals — loaded once per network via neat_load(),
// then neat_step() is the hot path called on every poker action.
//
// Connection format: CSR (Compressed Sparse Row) indexed by TARGET neuron.
// For neuron i, its incoming connections are at indices [nn_csr[i], nn_csr[i+1]).
//
// Weights are ternary i8 {-1, 0, +1}. Zero-weight connections are pre-filtered
// by the JS compile() step so they never appear here.
//
// Recurrent connections: nn_ts[j] > 0 → use circular history with that delay.
// Feedforward connections: nn_ts[j] == 0 → use nn_act[from] directly.
// Activation: sigmoid for all non-input neurons; input neurons pass through raw.

const NEAT_N: usize = 12000; // max neurons
const NEAT_C: usize = 16000; // max active non-zero connections
const NEAT_H: usize = 4; // max history depth (slots)
const NEAT_O: usize = 64; // max output neurons

var nn_n: u32 = 0; // neuron count (= this.neurons.length; used for CSR/bias/history indexing)
var nn_lo: u32 = 0; // active neuron count in layer order (= layerOrder.length; used for step loop)
var nn_ic: u32 = 0; // input neuron count
var nn_oc: u32 = 0; // output neuron count
var nn_cc: u32 = 0; // connection count
var nn_hd: u32 = 2; // history depth (circular slots)
var nn_hh: u32 = 0; // history head — points to most-recently written slot

// Neuron data
var nn_order: [NEAT_N]u32 = [_]u32{0} ** NEAT_N; // neuron indices in topological order
var nn_bias: [NEAT_N]f32 = [_]f32{0} ** NEAT_N;
var nn_act: [NEAT_N]f32 = [_]f32{0} ** NEAT_N; // current activations

// Circular history: nn_hist[neuron_idx * NEAT_H + slot]
var nn_hist: [NEAT_N * NEAT_H]f32 = [_]f32{0} ** (NEAT_N * NEAT_H);

// CSR connection data (sorted by target neuron)
var nn_csr: [NEAT_N + 1]i32 = [_]i32{0} ** (NEAT_N + 1); // start index per target neuron
var nn_from: [NEAT_C]u32 = [_]u32{0} ** NEAT_C; // source neuron index
var nn_w: [NEAT_C]i8 = [_]i8{0} ** NEAT_C; // ternary weight {-1, +1}
var nn_ts: [NEAT_C]u8 = [_]u8{0} ** NEAT_C; // 0 = feedforward; >0 = recurrent delay

var nn_out: [NEAT_O]u32 = [_]u32{0} ** NEAT_O; // output neuron indices

fn neat_sigmoid(x: f32) f32 {
    return 1.0 / (1.0 + @exp(-x));
}

// Load network topology into static buffers.
// Called once per network before running neat_step().
// layer_order_p: neuron indices in topological order (input neurons first)
// bias_p:        bias per neuron (indexed by linear position in this.neurons)
// csr_p:         CSR starts, length = n+1
// from_p:        source neuron index per connection
// w_p:           ternary weight per connection (i8)
// ts_p:          timestep per connection (0=FF, >0=recurrent delay)
// out_p:         indices of output-layer neurons
pub export fn neat_load(
    n: u32,
    lo: u32,
    ic: u32,
    oc: u32,
    hd: u32,
    cc: u32,
    layer_order_p: [*]const u32,
    bias_p: [*]const f32,
    csr_p: [*]const i32,
    from_p: [*]const u32,
    w_p: [*]const i8,
    ts_p: [*]const u8,
    out_p: [*]const u32,
) void {
    nn_n = n;
    nn_lo = lo;
    nn_ic = ic;
    nn_oc = oc;
    nn_cc = cc;
    nn_hd = if (hd > NEAT_H) NEAT_H else if (hd < 1) 1 else hd;
    nn_hh = 0;
    @memcpy(nn_order[0..lo], layer_order_p[0..lo]);
    @memcpy(nn_bias[0..n], bias_p[0..n]);
    @memcpy(nn_csr[0 .. n + 1], csr_p[0 .. n + 1]);
    @memcpy(nn_from[0..cc], from_p[0..cc]);
    @memcpy(nn_w[0..cc], w_p[0..cc]);
    @memcpy(nn_ts[0..cc], ts_p[0..cc]);
    @memcpy(nn_out[0..oc], out_p[0..oc]);
    @memset(nn_act[0..n], 0);
    @memset(nn_hist[0 .. n * nn_hd], 0);
}

// Reset activation and history state (call before each new hand/episode).
pub export fn neat_reset() void {
    @memset(nn_act[0..nn_n], 0);
    @memset(nn_hist[0 .. nn_n * nn_hd], 0);
    nn_hh = 0;
}

// Run one forward step.
// in_p:  f32[input_count] — raw input values for layer-0 neurons
// out_p: f32[output_count] — filled with output neuron activations
pub export fn neat_step(in_p: [*]const f32, out_p: [*]f32) void {
    const ic = nn_ic;
    const n = nn_n;
    const hd = nn_hd;
    const hh = nn_hh;

    // Input neurons: pass input values through directly (no bias, no activation)
    var i: u32 = 0;
    while (i < ic) : (i += 1) {
        nn_act[nn_order[i]] = in_p[i];
    }

    // Hidden and output neurons: accumulate weighted inputs then apply sigmoid
    i = ic;
    while (i < nn_lo) : (i += 1) {
        const ni = nn_order[i];
        var sum: f32 = nn_bias[ni];
        var j: usize = @intCast(nn_csr[ni]);
        const j_end: usize = @intCast(nn_csr[ni + 1]);
        while (j < j_end) : (j += 1) {
            const from = nn_from[j];
            const ts = nn_ts[j];
            const src: f32 = if (ts == 0)
                nn_act[from] // feedforward: use current activation
            else blk: {
                // Recurrent: read from circular history.
                // hh points to the most-recently written slot (previous step).
                // delay=1 → slot hh; delay=2 → slot (hh+hd-1)%hd; etc.
                const delay: u32 = ts;
                const slot = (hh + hd - (delay - 1)) % hd;
                break :blk nn_hist[from * hd + slot];
            };
            sum += @as(f32, @floatFromInt(nn_w[j])) * src;
        }
        nn_act[ni] = neat_sigmoid(sum);
    }

    // Advance circular history head and record current activations
    const new_hh = (hh + 1) % hd;
    nn_hh = new_hh;
    i = 0;
    while (i < n) : (i += 1) {
        nn_hist[i * hd + new_hh] = nn_act[i];
    }

    // Write output neuron activations
    i = 0;
    while (i < nn_oc) : (i += 1) {
        out_p[i] = nn_act[nn_out[i]];
    }
}
