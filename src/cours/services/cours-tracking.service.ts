import { Injectable } from '@nestjs/common';
import { CoursService } from '../cours.service';
import { CoursRewardsService } from './cours-rewards.service';

@Injectable()
export class CoursTrackingService {
  constructor(
    private readonly coursService: CoursService,
    private readonly coursRewardsService: CoursRewardsService,
  ) {}

  trackCoursView(coursId: string, userId: string, metadata?: Record<string, any>) {
    return this.coursService.trackCoursView(coursId, userId, metadata);
  }

  trackCoursStart(coursId: string, userId: string, metadata?: Record<string, any>) {
    return this.coursService.trackCoursStart(coursId, userId, metadata);
  }

  trackCoursComplete(coursId: string, userId: string, metadata?: Record<string, any>) {
    return this.coursRewardsService.trackCoursComplete(coursId, userId, metadata);
  }

  updateCoursWatchTime(coursId: string, userId: string, additionalTime: number) {
    return this.coursService.updateCoursWatchTime(coursId, userId, additionalTime);
  }

  trackCoursLike(coursId: string, userId: string, metadata?: Record<string, any>) {
    return this.coursService.trackCoursLike(coursId, userId, metadata || {});
  }

  trackCoursShare(coursId: string, userId: string, metadata?: Record<string, any>) {
    return this.coursService.trackCoursShare(coursId, userId, metadata || {});
  }

  trackCoursDownload(coursId: string, userId: string, metadata?: Record<string, any>) {
    return this.coursService.trackCoursDownload(coursId, userId, metadata || {});
  }

  addCoursBookmark(coursId: string, userId: string, bookmarkId: string) {
    return this.coursService.addCoursBookmark(coursId, userId, bookmarkId);
  }

  removeCoursBookmark(coursId: string, userId: string, bookmarkId: string) {
    return this.coursService.removeCoursBookmark(coursId, userId, bookmarkId);
  }

  addCoursRating(coursId: string, userId: string, rating: number, review?: string) {
    return this.coursService.addCoursRating(coursId, userId, rating, review);
  }

  getCoursProgress(coursId: string, userId: string) {
    return this.coursService.getCoursProgress(coursId, userId);
  }

  getCoursStats(coursId: string) {
    return this.coursService.getCoursStats(coursId);
  }

  getCoursReviews(coursId: string) {
    return this.coursService.getCoursReviews(coursId);
  }
}
