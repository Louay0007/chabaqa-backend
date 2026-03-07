import { Injectable } from '@nestjs/common';
import { CoursService } from '../cours.service';

@Injectable()
export class CoursContentService {
  constructor(private readonly coursService: CoursService) {}

  getCourses(page = 1, limit = 10, category?: string, niveau?: string, search?: string) {
    return this.coursService.getCourses(page, limit, category, niveau, search);
  }

  creerCours(dto: any, userId: string) {
    return this.coursService.creerCours(dto, userId);
  }

  obtenirCoursParCommunaute(
    communitySlug: string,
    page = 1,
    limit = 10,
    seulementsPublies = true,
    userId?: string,
  ) {
    return this.coursService.obtenirCoursParCommunaute(
      communitySlug,
      page,
      limit,
      seulementsPublies,
      userId,
    );
  }

  obtenirCoursParCreateur(userId: string, page = 1, limit = 10, search?: string) {
    return this.coursService.obtenirCoursParCreateur(userId, page, limit, search);
  }

  obtenirCoursParUtilisateur(
    userId: string,
    page = 1,
    limit = 10,
    type: 'enrolled' | 'created' | 'all' = 'all',
    visibilityScope: 'owner' | 'public' = 'owner',
  ) {
    return this.coursService.obtenirCoursParUtilisateur(userId, page, limit, type, visibilityScope);
  }

  obtenirCours(coursId: string, userId?: string) {
    return this.coursService.obtenirCours(coursId, userId);
  }

  updateCours(coursId: string, dto: any, userId: string) {
    return this.coursService.updateCours(coursId, dto, userId);
  }

  togglePublication(coursId: string, userId: string) {
    return this.coursService.togglePublication(coursId, userId);
  }

  supprimerCours(coursId: string, userId: string) {
    return this.coursService.supprimerCours(coursId, userId);
  }

  updateSection(coursId: string, sectionId: string, dto: any, userId: string) {
    return this.coursService.updateSection(coursId, sectionId, dto, userId);
  }

  ajouterSection(coursId: string, dto: any, userId: string) {
    return this.coursService.ajouterSection(coursId, dto, userId);
  }

  supprimerSection(coursId: string, sectionId: string, userId: string) {
    return this.coursService.supprimerSection(coursId, sectionId, userId);
  }

  updateChapitre(coursId: string, sectionId: string, chapitreId: string, dto: any, userId: string) {
    return this.coursService.updateChapitre(coursId, sectionId, chapitreId, dto, userId);
  }

  ajouterChapitreASection(coursId: string, sectionId: string, dto: any, userId: string) {
    return this.coursService.ajouterChapitreASection(coursId, sectionId, dto, userId);
  }

  supprimerChapitre(coursId: string, sectionId: string, chapitreId: string, userId: string) {
    return this.coursService.supprimerChapitre(coursId, sectionId, chapitreId, userId);
  }

  ajouterRessourceAChapitre(
    coursId: string,
    sectionId: string,
    chapitreId: string,
    ressource: any,
    userId: string,
  ) {
    return this.coursService.ajouterRessourceAChapitre(coursId, sectionId, chapitreId, ressource, userId);
  }

  mettreAJourThumbnail(coursId: string, thumbnailUrl: string, userId: string) {
    return this.coursService.mettreAJourThumbnail(coursId, thumbnailUrl, userId);
  }

  mettreAJourVideoUrl(
    coursId: string,
    sectionId: string,
    chapitreId: string,
    videoUrl: string,
    userId: string,
  ) {
    return this.coursService.mettreAJourVideoUrl(coursId, sectionId, chapitreId, videoUrl, userId);
  }

  uploadChapterVideo(coursId: string, sectionId: string, chapitreId: string, file: any, userId: string) {
    return this.coursService.uploadChapterVideo(coursId, sectionId, chapitreId, file, userId);
  }

  verifierPermissionsCours(coursId: string, userId: string) {
    return this.coursService.verifierPermissionsCours(coursId, userId);
  }
}
