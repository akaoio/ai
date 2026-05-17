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
