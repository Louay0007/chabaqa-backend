import { Injectable } from '@nestjs/common';
import { CoursService } from '../cours.service';

@Injectable()
export class CoursRewardsService {
  constructor(private readonly coursService: CoursService) {}

  trackCoursComplete(coursId: string, userId: string, metadata?: Record<string, any>) {
    return this.coursService.trackCoursComplete(coursId, userId, metadata);
  }
}
