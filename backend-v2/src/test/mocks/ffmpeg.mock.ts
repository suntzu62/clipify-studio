import { vi } from 'vitest';
import { EventEmitter } from 'events';

export class MockFfmpegCommand extends EventEmitter {
  private _input: string = '';
  private _outputPath: string = '';
  private _options: string[] = [];

  input(path: string) {
    this._input = path;
    return this;
  }

  output(path: string) {
    this._outputPath = path;
    return this;
  }

  outputOptions(...options: string[]) {
    this._options.push(...options.flat());
    return this;
  }

  inputOptions(...options: string[]) {
    this._options.push(...options.flat());
    return this;
  }

  videoCodec(codec: string) {
    this._options.push(`-c:v ${codec}`);
    return this;
  }

  audioCodec(codec: string) {
    this._options.push(`-c:a ${codec}`);
    return this;
  }

  size(size: string) {
    this._options.push(`-s ${size}`);
    return this;
  }

  fps(rate: number) {
    this._options.push(`-r ${rate}`);
    return this;
  }

  duration(time: number) {
    this._options.push(`-t ${time}`);
    return this;
  }

  seek(time: number) {
    this._options.push(`-ss ${time}`);
    return this;
  }

  noAudio() {
    this._options.push('-an');
    return this;
  }

  noVideo() {
    this._options.push('-vn');
    return this;
  }

  format(fmt: string) {
    this._options.push(`-f ${fmt}`);
    return this;
  }

  complexFilter(filter: string | string[]) {
    return this;
  }

  on(event: string, handler: (...args: any[]) => void) {
    super.on(event, handler);
    return this;
  }

  run() {
    // Simulate async completion
    setImmediate(() => {
      this.emit('end');
    });
    return this;
  }

  save(path: string) {
    this._outputPath = path;
    setImmediate(() => {
      this.emit('end');
    });
    return this;
  }

  // For testing - simulate error
  simulateError(error: Error) {
    setImmediate(() => {
      this.emit('error', error);
    });
  }

  // For testing - simulate progress
  simulateProgress(progress: { percent: number }) {
    this.emit('progress', progress);
  }

  // Get current configuration for assertions
  getConfig() {
    return {
      input: this._input,
      output: this._outputPath,
      options: this._options,
    };
  }
}

export const mockFfprobe = vi.fn();

export const mockFfmpeg = vi.fn().mockImplementation((input?: string) => {
  const cmd = new MockFfmpegCommand();
  if (input) {
    cmd.input(input);
  }
  return cmd;
});

// Static methods
mockFfmpeg.ffprobe = mockFfprobe;
mockFfmpeg.setFfmpegPath = vi.fn();
mockFfmpeg.setFfprobePath = vi.fn();

export function setupFfmpegMock() {
  vi.mock('fluent-ffmpeg', () => ({
    default: mockFfmpeg,
  }));
}

export function resetFfmpegMock() {
  mockFfmpeg.mockClear();
  mockFfprobe.mockReset();
}

// Helper to create mock ffprobe metadata
export function createMockFfprobeData(overrides?: Partial<{
  format: any;
  streams: any[];
}>) {
  return {
    format: {
      filename: 'test-video.mp4',
      nb_streams: 2,
      format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
      duration: '120.000000',
      size: '10485760',
      bit_rate: '699050',
      ...overrides?.format,
    },
    streams: overrides?.streams ?? [
      {
        index: 0,
        codec_name: 'h264',
        codec_type: 'video',
        width: 1920,
        height: 1080,
        r_frame_rate: '30/1',
        duration: '120.000000',
      },
      {
        index: 1,
        codec_name: 'aac',
        codec_type: 'audio',
        sample_rate: '44100',
        channels: 2,
        duration: '120.000000',
      },
    ],
  };
}

// Helper to setup ffprobe response
export function setupFfprobeResponse(data: any) {
  mockFfprobe.mockImplementation((path: string, callback: (err: Error | null, data: any) => void) => {
    callback(null, data);
  });
}

// Helper to setup ffprobe error
export function setupFfprobeError(error: Error) {
  mockFfprobe.mockImplementation((path: string, callback: (err: Error | null, data: any) => void) => {
    callback(error, null);
  });
}
