export interface POSConfig {
  samplingRate: number; // 120 Hz
  windowSeconds: number; // 1.5 seconds
}

export class POSProjection {
  private capacity: number;
  private redBuffer: Float32Array;
  private greenBuffer: Float32Array;
  private blueBuffer: Float32Array;
  private writeIndex: number = 0;
  private count: number = 0;
  private isFilled: boolean = false;

  constructor(config: Partial<POSConfig> = {}) {
    const windowSec = config.windowSeconds ?? 1.5;
    const fs = config.samplingRate ?? 120;
    this.capacity = Math.max(10, Math.round(windowSec * fs));
    this.redBuffer = new Float32Array(this.capacity);
    this.greenBuffer = new Float32Array(this.capacity);
    this.blueBuffer = new Float32Array(this.capacity);
  }

  public reset(): void {
    this.redBuffer.fill(0);
    this.greenBuffer.fill(0);
    this.blueBuffer.fill(0);
    this.writeIndex = 0;
    this.count = 0;
    this.isFilled = false;
  }

  /**
   * Pushes a raw (R, G, B) sample and returns the POS projected pulsatile sample.
   */
  public processSample(red: number, green: number, blue: number): number {
    this.redBuffer[this.writeIndex] = red;
    this.greenBuffer[this.writeIndex] = green;
    this.blueBuffer[this.writeIndex] = blue;

    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    this.count++;
    if (this.writeIndex === 0) {
      this.isFilled = true;
    }

    const currentLen = this.isFilled ? this.capacity : this.count;

    if (currentLen < 10) {
      // Warm-up period
      return 0;
    }

    // Compute moving averages
    let sumR = 0, sumG = 0, sumB = 0;
    for (let i = 0; i < currentLen; i++) {
      sumR += this.redBuffer[i];
      sumG += this.greenBuffer[i];
      sumB += this.blueBuffer[i];
    }
    
    const meanR = sumR / currentLen + 1e-6;
    const meanG = sumG / currentLen + 1e-6;
    const meanB = sumB / currentLen + 1e-6;

    // Normalize current sample by moving average
    const normR = red / meanR;
    const normG = green / meanG;
    const normB = blue / meanB;

    const s1 = normG - normB;
    const s2 = normG + normB - 2.0 * normR;

    // To compute standard deviation, we'd need to normalize the whole buffer.
    // However, for online processing, approximating alpha using the moving average
    // or standard deviation of the buffer is computationally heavy if done per sample.
    // Let's compute alpha using the whole buffer normalized by the current mean
    // to perfectly match the batch algorithm behavior over the window.
    
    let varS1 = 0;
    let varS2 = 0;
    let sumS1 = 0;
    let sumS2 = 0;
    
    for (let i = 0; i < currentLen; i++) {
        const nr = this.redBuffer[i] / meanR;
        const ng = this.greenBuffer[i] / meanG;
        const nb = this.blueBuffer[i] / meanB;
        
        const curS1 = ng - nb;
        const curS2 = ng + nb - 2.0 * nr;
        
        sumS1 += curS1;
        sumS2 += curS2;
    }
    
    const meanS1 = sumS1 / currentLen;
    const meanS2 = sumS2 / currentLen;
    
    for (let i = 0; i < currentLen; i++) {
        const nr = this.redBuffer[i] / meanR;
        const ng = this.greenBuffer[i] / meanG;
        const nb = this.blueBuffer[i] / meanB;
        
        const curS1 = ng - nb;
        const curS2 = ng + nb - 2.0 * nr;
        
        varS1 += (curS1 - meanS1) * (curS1 - meanS1);
        varS2 += (curS2 - meanS2) * (curS2 - meanS2);
    }
    
    const stdS1 = Math.sqrt(varS1 / currentLen);
    const stdS2 = Math.sqrt(varS2 / currentLen);
    
    const alpha = stdS1 / (stdS2 + 1e-6);

    const posSignal = s1 + alpha * s2;
    return posSignal;
  }
}
