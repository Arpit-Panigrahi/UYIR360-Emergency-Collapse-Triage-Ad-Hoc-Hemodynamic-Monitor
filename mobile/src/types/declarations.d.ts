declare module 'fili' {
  const Fili: any;
  export default Fili;
}

declare module 'fft.js' {
  export default class FFT {
    constructor(size: number);
    createComplexArray(): number[];
    realTransform(out: number[], data: number[] | Float64Array | Float32Array): void;
    completeSpectrum(out: number[]): void;
    fromComplexArray(complex: number[], out: number[]): void;
  }
}
