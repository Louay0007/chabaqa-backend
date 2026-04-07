import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  Req,
} from '@nestjs/common';
import { TranscriptionService } from './transcription.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Response } from 'express';

@Controller('transcription')
export class TranscriptionController {
  constructor(private readonly transcriptionService: TranscriptionService) {}

  @Post('trigger')
  @UseGuards(JwtAuthGuard)
  async triggerTranscription(
    @Body()
    body: {
      chapterId: string;
      courseId: string;
      videoStorageKey?: string;
      language?: 'ar' | 'fr' | 'en' | 'auto';
    },
  ) {
    let storageKey = body.videoStorageKey;
    if (!storageKey) {
      // Fall back to the storage key stored in the existing transcript
      const existing = await this.transcriptionService.getTranscript(
        body.chapterId,
      );
      storageKey = existing?.videoStorageKey;
    }
    if (!storageKey) {
      throw new Error('videoStorageKey is required — upload a video first');
    }
    return this.transcriptionService.triggerTranscription(
      body.chapterId,
      body.courseId,
      storageKey,
      body.language,
    );
  }

  @Get('search')
  async searchTranscripts(
    @Query('q') query: string,
    @Query('courseId') courseId: string,
  ) {
    return this.transcriptionService.searchTranscripts(courseId, query);
  }

  @Get(':chapterId/status')
  async getStatus(@Param('chapterId') chapterId: string) {
    return this.transcriptionService.getStatus(chapterId);
  }

  @Get(':chapterId/download')
  async downloadTranscript(
    @Param('chapterId') chapterId: string,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    const transcript = await this.transcriptionService.getTranscript(chapterId);
    if (!transcript) return res.status(404).send('Not found');
    if (format === 'srt') {
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="transcript.srt"',
      );
      res.setHeader('Content-Type', 'text/plain');
      return res.send(transcript.srtContent);
    } else if (format === 'vtt') {
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="transcript.vtt"',
      );
      res.setHeader('Content-Type', 'text/vtt');
      return res.send(transcript.vttContent);
    }
    return res.status(400).send('Invalid format');
  }

  @Get(':chapterId')
  async getTranscript(@Param('chapterId') chapterId: string) {
    return this.transcriptionService.getTranscript(chapterId);
  }

  @Put(':chapterId/segments')
  @UseGuards(JwtAuthGuard)
  async updateSegments(
    @Param('chapterId') chapterId: string,
    @Body() body: { segments: any[] },
  ) {
    const transcript = await this.transcriptionService.getTranscript(chapterId);
    if (!transcript) throw new Error('Not found');
    return this.transcriptionService.updateSegments(
      transcript._id.toString(),
      body.segments,
    );
  }
}
