import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import { Transcript, TranscriptDocument } from '../schema/transcript.schema';

@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);
  private pipe: any = null;
  private isModelLoading = false;

  constructor(
    @InjectModel(Transcript.name)
    private transcriptModel: Model<TranscriptDocument>,
  ) {}

  private async getPipeline() {
    if (this.pipe) return this.pipe;
    if (this.isModelLoading) {
      while (this.isModelLoading) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      return this.pipe;
    }

    this.isModelLoading = true;
    try {
      this.logger.log('Loading Whisper model Xenova/whisper-small...');
      const { pipeline } = await import('@xenova/transformers');
      this.pipe = await pipeline(
        'automatic-speech-recognition',
        'Xenova/whisper-small',
      );
      this.logger.log('Whisper model loaded.');
      return this.pipe;
    } catch (error) {
      this.logger.error(`Failed to load model: ${error.message}`);
      throw error;
    } finally {
      this.isModelLoading = false;
    }
  }

  formatSRT(segments: any[]): string {
    const pad = (n: number, width = 2) => String(n).padStart(width, '0');
    const formatTime = (seconds: number) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 1000);
      return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
    };

    return segments
      .map((seg, i) => {
        return `${i + 1}\n${formatTime(seg.start)} --> ${formatTime(seg.end)}\n${seg.text.trim()}\n`;
      })
      .join('\n');
  }

  formatVTT(segments: any[]): string {
    const pad = (n: number, width = 2) => String(n).padStart(width, '0');
    const formatTime = (seconds: number) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 1000);
      return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
    };

    let vtt = 'WEBVTT\n\n';
    vtt += segments
      .map((seg) => {
        return `${formatTime(seg.start)} --> ${formatTime(seg.end)}\n${seg.text.trim()}\n`;
      })
      .join('\n');
    return vtt;
  }

  async triggerTranscription(
    chapterId: string,
    courseId: string,
    videoStorageKey: string,
    language: 'ar' | 'fr' | 'en' | 'auto' = 'auto',
  ): Promise<TranscriptDocument> {
    let transcript = await this.transcriptModel.findOne({ chapterId }).exec();
    if (!transcript) {
      transcript = new this.transcriptModel({
        chapterId,
        courseId,
        videoStorageKey,
        language,
        status: 'pending',
      });
      await transcript.save();
    } else {
      transcript.status = 'pending';
      transcript.language = language;
      transcript.videoStorageKey = videoStorageKey;
      transcript.errorMessage = '';
      await transcript.save();
    }

    this.processAsync(
      transcript._id.toString(),
      videoStorageKey,
      language,
    ).catch((err) => {
      this.logger.error(`Async process failed: ${err.message}`);
    });

    return transcript;
  }

  private async processAsync(
    transcriptId: string,
    videoStorageKey: string,
    language: string,
  ) {
    const transcript = await this.transcriptModel.findById(transcriptId).exec();
    if (!transcript) return;

    transcript.status = 'processing';
    await transcript.save();

    const videoPath = path.join(process.cwd(), 'uploads', videoStorageKey);
    const tempWav = path.join(
      os.tmpdir(),
      `audio_${new Types.ObjectId().toString()}.wav`,
    );

    try {
      if (!fs.existsSync(videoPath)) {
        throw new Error(`Video file not found: ${videoPath}`);
      }

      await new Promise<void>((resolve, reject) => {
        ffmpeg(videoPath)
          .outputOptions(['-ar 16000', '-ac 1', '-f wav'])
          .output(tempWav)
          .on('end', () => resolve())
          .on('error', (err) =>
            reject(new Error(`FFmpeg error: ${err.message}`)),
          )
          .run();
      });

      const transcriber = await this.getPipeline();
      const options: any = { return_timestamps: true };
      if (language !== 'auto') {
        options.language = language;
      }

      const result = await transcriber(tempWav, options);
      const segments = result.chunks.map((chunk: any) => ({
        text: chunk.text,
        start: chunk.timestamp[0],
        end: chunk.timestamp[1] || chunk.timestamp[0] + 5,
      }));
      const fullText = result.text;

      transcript.segments = segments;
      transcript.fullText = fullText;
      transcript.srtContent = this.formatSRT(segments);
      transcript.vttContent = this.formatVTT(segments);
      transcript.status = 'done';
      await transcript.save();
    } catch (error) {
      this.logger.error(`Transcription failed: ${error.message}`);
      transcript.status = 'failed';
      transcript.errorMessage = error.message;
      await transcript.save();
    } finally {
      if (fs.existsSync(tempWav)) {
        fs.unlinkSync(tempWav);
      }
    }
  }

  async getTranscript(chapterId: string): Promise<TranscriptDocument | null> {
    return this.transcriptModel.findOne({ chapterId }).exec();
  }

  async getStatus(chapterId: string) {
    const transcript = await this.transcriptModel
      .findOne({ chapterId })
      .select('status')
      .exec();
    return { status: transcript ? transcript.status : 'not_found' };
  }

  async updateSegments(transcriptId: string, segments: any[]): Promise<void> {
    const transcript = await this.transcriptModel.findById(transcriptId).exec();
    if (!transcript) throw new Error('Not found');

    transcript.segments = segments;
    transcript.fullText = segments.map((s) => s.text).join(' ');
    transcript.srtContent = this.formatSRT(segments);
    transcript.vttContent = this.formatVTT(segments);
    await transcript.save();
  }

  async searchTranscripts(courseId: string, query: string) {
    const transcripts = await this.transcriptModel
      .find({
        courseId,
        status: 'done',
        $text: { $search: query },
      })
      .exec();

    const lowerQuery = query.toLowerCase();
    return transcripts.map((t) => ({
      chapterId: t.chapterId,
      courseId: t.courseId,
      segments: t.segments.filter((s) =>
        s.text.toLowerCase().includes(lowerQuery),
      ),
    }));
  }
}
