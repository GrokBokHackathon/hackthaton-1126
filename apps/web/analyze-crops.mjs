// Analyze what colors are actually present in the crop images
import { createReadStream } from "node:fs";
import { PNG } from "pngjs";

async function analyzeImage(imagePath) {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(imagePath);
    const png = new PNG();
    
    stream
      .pipe(png)
      .on("parsed", function() {
        const colorMap = new Map();
        
        for (let y = 0; y < this.height; y++) {
          for (let x = 0; x < this.width; x++) {
            const idx = (this.width * y + x) * 4;
            const r = this.data[idx];
            const g = this.data[idx + 1];
            const b = this.data[idx + 2];
            const a = this.data[idx + 3];
            
            if (a > 200) {
              const colorKey = `${r},${g},${b}`;
              colorMap.set(colorKey, (colorMap.get(colorKey) || 0) + 1);
            }
          }
        }
        
        // Sort by count
        const sorted = Array.from(colorMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15); // Top 15 colors
        
        resolve({ width: this.width, height: this.height, colors: sorted });
      })
      .on("error", reject);
  });
}

async function main() {
  const images = [
    { name: "Red base crop", path: "/opt/cursor/artifacts/red-base-detail-4x.png" },
    { name: "Bot base crop", path: "/opt/cursor/artifacts/bot-base-detail-4x.png" },
  ];

  for (const { name, path } of images) {
    try {
      console.log(`\n=== ${name} ===`);
      const analysis = await analyzeImage(path);
      console.log(`Size: ${analysis.width}x${analysis.height}`);
      console.log(`Top colors:`);
      
      for (const [rgb, count] of analysis.colors) {
        const [r, g, b] = rgb.split(",").map(Number);
        const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        const pct = (count / (analysis.width * analysis.height) * 100).toFixed(1);
        console.log(`  ${hex} (${r},${g},${b}) - ${count} px (${pct}%)`);
      }
    } catch (err) {
      console.error(`Failed to analyze ${name}:`, err.message);
    }
  }
}

main();
