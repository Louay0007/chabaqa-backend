import { Injectable } from '@nestjs/common';
import { CoursService } from '../cours.service';

@Injectable()
export class CoursEnrollmentService {
  constructor(private readonly coursService: CoursService) {}

  obtenirCoursInscrit(userId: string, page = 1, limit = 10) {
    return this.coursService.obtenirCoursInscrit(userId, page, limit);
  }

  inscrireAuCours(coursId: string, userId: string, promoCode?: string) {
    return this.coursService.inscrireAuCours(coursId, userId, promoCode);
  }

  verifierAccesChapitre(coursId: string, chapitreId: string, userId: string) {
    return this.coursService.verifierAccesChapitre(coursId, chapitreId, userId);
  }
}
