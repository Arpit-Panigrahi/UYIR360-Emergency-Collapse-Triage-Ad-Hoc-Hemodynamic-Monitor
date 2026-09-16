import fs from "fs";
import path from "path";
import { config } from "../config.ts";

export class StorageService {
  public savePhoto(filename: string, buffer: Buffer): string {
    const targetPath = path.join(config.photosDir, filename);
    fs.writeFileSync(targetPath, buffer);
    return targetPath;
  }

  public saveChart(filename: string, content: string | Buffer): string {
    const targetPath = path.join(config.chartsDir, filename);
    fs.writeFileSync(targetPath, content);
    return targetPath;
  }

  public getPhotoPath(filename: string): string {
    return path.join(config.photosDir, filename);
  }

  public getChartPath(filename: string): string {
    return path.join(config.chartsDir, filename);
  }
}

export const storageService = new StorageService();
