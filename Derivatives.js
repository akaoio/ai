export const sigmoid = (x = 0) => {
    return x * (1 - x)
}

export const relu = (x = 0) => {
    return x >= 0 ? 1 : 0
}

export const tanh = (x = 0) => {
    return 1 - Math.pow(x, 2)
}

export default { sigmoid, relu, tanh }
