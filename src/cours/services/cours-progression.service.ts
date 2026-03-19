import { Injectable } from '@nestjs/common';
import { CoursService } from '../cours.service';
import { CourseSessionDto } from '../../common/dto/course-session.dto';

@Injectable()
export class CoursProgressionService {
  constructor(private readonly coursService: CoursService) {}

  getUserCoursProgress(userId: string, page = 1, limit = 10) {
    return this.coursService.getUserCoursProgress(userId, page, limit);
  }

  getUserCoursRecentActions(userId: string, limit = 20) {
    return this.coursService.getUserCoursRecentActions(userId, limit);
  }

  updateSequentialProgression(coursId: string, enabled: boolean, unlockMessage: string | undefined, userId: string) {
    return this.coursService.updateSequentialProgression(coursId, enabled, unlockMessage, userId);
  }

  checkChapterAccessWithSequential(coursId: string, chapterId: string, userId: string) {
    return this.coursService.checkChapterAccessWithSequential(coursId, chapterId, userId);
  }

  getUnlockedChapters(coursId: string, userId: string) {
    return this.coursService.getUnlockedChapters(coursId, userId);
  }

  unlockChapterManually(coursId: string, chapterId: string, targetUserId: string, requesterId: string) {
    return this.coursService.unlockChapterManually(coursId, chapterId, targetUserId, requesterId);
  }

  getCourseSession(coursId: string, userId: string, currentChapterId?: string): Promise<CourseSessionDto> {
    return this.coursService.getCourseSession(coursId, userId, currentChapterId);
  }
}
