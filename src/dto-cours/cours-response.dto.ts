/**
 * DTO pour les ressources d'un cours
 */
export class CourseResourceResponseDto {
  id: string;
  titre: string;
  type: 'video' | 'article' | 'code' | 'outil' | 'pdf' | 'lien';
  url: string;
  description: string;
  ordre: number;
}

/**
 * DTO pour la réponse d'un chapitre
 */
export class ChapitreResponseDto {
  id: string;
  titre: string;
  description: string;
  videoUrl?: string;
  isPaid: boolean;
  ordre: number;
  duree?: string;
  courseId: string;
  sectionId?: string;
  prix?: number;
  isPaidChapter: boolean;
  notes?: string;
  ressources?: CourseResourceResponseDto[];
  createdAt?: Date;
}

/**
 * DTO pour la réponse d'une section
 */
export class CourseSectionResponseDto {
  id: string;
  titre: string;
  description?: string;
  courseId: string;
  ordre: number;
  chapitres: ChapitreResponseDto[];
  createdAt: Date;
}

/**
 * DTO pour les informations du créateur
 */
export class CreatorInfoDto {
  id: string;
  name: string;
  avatar?: string;
  email: string;
}

/**
 * DTO pour les informations de la communauté
 */
export class CommunityInfoDto {
  id: string;
  name: string;
  slug: string;
  logo: string;
  category: string;
}

/**
 * DTO pour la réponse d'un cours
 */
export class CoursResponseDto {
  mongoId?: string;
  id: string;
  titre: string;
  description: string;
  thumbnail?: string;
  isPaid: boolean;
  prix: number;
  devise: string;
  isPaidCourse: boolean;
  communitySlug: string;
  communityId: string;
  creatorId: string;
  isPublished: boolean;
  enrollmentCount: number;
  averageRating: number;
  ratingCount: number;
  sections: CourseSectionResponseDto[];
  category?: string;
  niveau?: string;
  duree?: string;
  learningObjectives?: string[];
  requirements?: string[];
  notes?: string;
  ressources?: CourseResourceResponseDto[];
  createdAt: string;
  updatedAt: string;

  // Informations populées
  creator?: CreatorInfoDto;
  community?: CommunityInfoDto;
}

/**
 * DTO pour la liste paginée de cours
 */
export class CoursListResponseDto {
  cours: CoursResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * DTO pour les statistiques d'un cours
 */
export class CoursStatsDto {
  id: string;
  titre: string;
  enrollmentCount: number;
  chapitresCount: number;
  chapitresGratuitsCount: number;
  isPublished: boolean;
  communitySlug: string;
  createdAt: string;
} 