// Memory monitoring utilities for debugging memory leaks

interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
  timestamp: number;
}

class MemoryMonitor {
  private samples: MemoryInfo[] = [];
  private intervalId: number | null = null;
  private isMonitoring = false;

  constructor() {
    // Bind methods to preserve context
    this.logMemory = this.logMemory.bind(this);
    this.startMonitoring = this.startMonitoring.bind(this);
    this.stopMonitoring = this.stopMonitoring.bind(this);
  }

  getCurrentMemory(): MemoryInfo | null {
    // Check if performance.memory is available (Chrome only)
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      const memory = (performance as any).memory;
      return {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
        timestamp: Date.now()
      };
    }
    return null;
  }

  logMemory(label?: string): void {
    const memory = this.getCurrentMemory();
    if (memory) {
      const usedMB = (memory.usedJSHeapSize / 1024 / 1024).toFixed(2);
      const totalMB = (memory.totalJSHeapSize / 1024 / 1024).toFixed(2);
      const limitMB = (memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2);
      
      console.log(
        `🔍 Memory ${label || 'usage'}: ${usedMB}MB used / ${totalMB}MB total (limit: ${limitMB}MB)`
      );
      
      this.samples.push(memory);
    } else {
      console.warn('🔍 Memory monitoring not available (Chrome only)');
    }
  }

  startMonitoring(intervalMs: number = 1000): void {
    if (this.isMonitoring) {
      this.stopMonitoring();
    }

    this.isMonitoring = true;
    this.samples = [];
    
    console.log(`🔍 Starting memory monitoring (interval: ${intervalMs}ms)`);
    this.logMemory('baseline');
    
    this.intervalId = window.setInterval(() => {
      this.logMemory('periodic');
    }, intervalMs);
  }

  stopMonitoring(): void {
    if (this.intervalId) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    this.isMonitoring = false;
    this.logMemory('final');
    
    if (this.samples.length > 1) {
      this.analyzeMemoryTrend();
    }
  }

  private analyzeMemoryTrend(): void {
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    
    const growthMB = (last.usedJSHeapSize - first.usedJSHeapSize) / 1024 / 1024;
    const timeMinutes = (last.timestamp - first.timestamp) / 1000 / 60;
    
    console.log(`📊 Memory analysis:`);
    console.log(`   Growth: ${growthMB.toFixed(2)}MB over ${timeMinutes.toFixed(1)} minutes`);
    console.log(`   Rate: ${(growthMB / timeMinutes).toFixed(2)}MB/min`);
    
    if (growthMB > 10) {
      console.warn(`⚠️  Potential memory leak detected! (${growthMB.toFixed(2)}MB growth)`);
    } else if (growthMB > 5) {
      console.warn(`🟡 High memory usage detected (${growthMB.toFixed(2)}MB growth)`);
    } else {
      console.log(`✅ Memory usage looks normal`);
    }
  }

  getMemoryReport(): { samples: MemoryInfo[], analysis: any } {
    const analysis = this.samples.length > 1 ? {
      firstSample: this.samples[0],
      lastSample: this.samples[this.samples.length - 1],
      growthMB: (this.samples[this.samples.length - 1].usedJSHeapSize - this.samples[0].usedJSHeapSize) / 1024 / 1024,
      timeMinutes: (this.samples[this.samples.length - 1].timestamp - this.samples[0].timestamp) / 1000 / 60
    } : null;

    return { samples: [...this.samples], analysis };
  }

  clearSamples(): void {
    this.samples = [];
  }
}

// Global memory monitor instance
export const memoryMonitor = new MemoryMonitor();

// Helper functions for common debugging scenarios
export function monitorImageUpload(onComplete?: () => void): void {
  console.log('🔍 Starting image upload memory monitoring...');
  memoryMonitor.logMemory('before upload');
  
  // Monitor for 10 seconds after upload
  setTimeout(() => {
    memoryMonitor.logMemory('after upload');
    onComplete?.();
  }, 10000);
}

export function monitorParameterChange(paramName: string): void {
  memoryMonitor.logMemory(`before ${paramName} change`);
  
  // Check memory after a brief delay to allow for processing
  setTimeout(() => {
    memoryMonitor.logMemory(`after ${paramName} change`);
  }, 1000);
}

export function forceGarbageCollection(): void {
  // Only available in Chrome with DevTools open and gc() enabled
  if (typeof (window as any).gc === 'function') {
    console.log('🗑️ Forcing garbage collection...');
    (window as any).gc();
    setTimeout(() => {
      memoryMonitor.logMemory('after GC');
    }, 100);
  } else {
    console.warn('🗑️ Garbage collection not available. Enable in Chrome DevTools → Console → Settings → Allow triggering garbage collection');
  }
}

// Development helpers
if (process.env.NODE_ENV === 'development') {
  // Make memory monitor available globally for debugging
  (window as any).memoryMonitor = memoryMonitor;
  (window as any).forceGC = forceGarbageCollection;
  
  console.log('🔧 Memory debugging tools loaded:');
  console.log('   window.memoryMonitor - access the memory monitor');
  console.log('   window.forceGC() - force garbage collection');
  console.log('   memoryMonitor.startMonitoring() - start periodic monitoring');
  console.log('   memoryMonitor.stopMonitoring() - stop and analyze');
}