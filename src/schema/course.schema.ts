import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Sous-schéma pour les ressources d'un cours
 */
@Schema({ _id: false })
export class CourseResource {
  @Prop({
    required: true,
    type: String
  })
  id: string;

  @Prop({
    required: true,
    trim: true,
    maxlength: 200
  })
  titre: string;

  @Prop({
    required: true,
    enum: ['video', 'article', 'code', 'outil', 'pdf', 'lien'],
    type: String
  })
  type: 'video' | 'article' | 'code' | 'outil' | 'pdf' | 'lien';

  @Prop({
    required: true,
    trim: true
  })
  url: string;

  @Prop({
    required: true,
    trim: true,
    maxlength: 1000
  })
  description: string;

  @Prop({
    required: true,
    type: Number,
    min: 0
  })
  ordre: number;
}

export const CourseResourceSchema = SchemaFactory.createForClass(CourseResource);

/**
 * Sous-schéma pour les chapitres d'un cours
 */
@Schema({ _id: false })
export class CourseChapter {
  @Prop({
    required: true,
    type: String
  })
  id: string;

  @Prop({
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 200
  })
  titre: string;

  @Prop({
    required: true,
    trim: true
  })
  contenu: string;

  @Prop({
    trim: true
  })
  videoUrl?: string;

  @Prop({
    type: Number,
    min: 0
  })
  duree?: number;

  @Prop({
    required: true,
    type: String
  })
  sectionId: string;

  @Prop({
    required: true,
    type: Number,
    min: 0
  })
  ordre: number;

  @Prop({
    type: Boolean,
    default: false
  })
  isPreview: boolean;

  @Prop({
    type: Number,
    min: 0
  })
  prix?: number;

  @Prop({
    type: Boolean,
    default: false
  })
  isPaidChapter: boolean;

  @Prop({
    trim: true
  })
  notes?: string;

  @Prop({
    type: [CourseResourceSchema],
    default: []
  })
  ressources?: CourseResource[];

  @Prop({
    type: Date,
    default: Date.now
  })
  createdAt: Date;
}

export const CourseChapterSchema = SchemaFactory.createForClass(CourseChapter);

/**
 * Sous-schéma pour les sections d'un cours
 */
@Schema({ _id: false })
export class CourseSection {
  @Prop({
    required: true,
    type: String
  })
  id: string;

  @Prop({
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 200
  })
  titre: string;

  @Prop({
    trim: true,
    maxlength: 1000
  })
  description?: string;

  @Prop({
    required: true,
    type: String
  })
  courseId: string;

  @Prop({
    required: true,
    type: Number,
    min: 0
  })
  ordre: number;

  @Prop({
    type: [CourseChapterSchema],
    default: []
  })
  chapitres: CourseChapter[];

  @Prop({
    type: Date,
    default: Date.now
  })
  createdAt: Date;
}

export const CourseSectionSchema = SchemaFactory.createForClass(CourseSection);

/**
 * Sous-schéma pour le progrès d'un cours
 */
@Schema({ timestamps: true })
export class CourseProgress {
  @Prop({
    required: true,
    type: String
  })
  id: string;

  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'CourseEnrollment'
  })
  enrollmentId: Types.ObjectId;

  @Prop({
    required: true,
    type: String
  })
  chapterId: string;

  @Prop({
    type: Boolean,
    default: false
  })
  isCompleted: boolean;

  @Prop({
    type: Number,
    default: 0,
    min: 0
  })
  watchTime: number;

  @Prop({
    type: Date
  })
  completedAt?: Date;

  @Prop({
    type: Date,
    default: Date.now
  })
  lastAccessedAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const CourseProgressSchema = SchemaFactory.createForClass(CourseProgress);

/**
 * Sous-schéma pour les inscriptions aux cours
 */
@Schema({ timestamps: true })
export class CourseEnrollment {
  @Prop({
    required: true,
    type: String
  })
  id: string;

  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'User'
  })
  userId: Types.ObjectId;

  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'Cours'
  })
  courseId: Types.ObjectId;

  @Prop({
    type: [CourseProgressSchema],
    default: []
  })
  progression: CourseProgress[];

  @Prop({
    type: Date,
    default: Date.now
  })
  enrolledAt: Date;

  @Prop({
    type: Date
  })
  completedAt?: Date;

  @Prop({
    type: Boolean,
    default: true
  })
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const CourseEnrollmentSchema = SchemaFactory.createForClass(CourseEnrollment);

/**
 * Interface pour le document Cours
 */
export interface CoursDocument extends Document {
  _id: Types.ObjectId;
  titre: string;
  description: string;
  thumbnail?: string;
  communityId: string;
  creatorId: Types.ObjectId;
  prix: number;
  devise: string;
  pricing?: {
    price: number;
    currency: string;
    priceType: 'free' | 'one-time' | 'monthly' | 'yearly';
    isRecurring: boolean;
    recurringInterval?: 'month' | 'year' | 'week';
    features: string[];
    paymentOptions: {
      allowInstallments: boolean;
      installmentCount?: number;
      earlyBirdDiscount?: number;
      groupDiscount?: number;
      memberDiscount?: number;
    };
    freeTrialDays?: number;
    trialFeatures?: string[];
  };
  isPublished: boolean;
  sections: CourseSection[];
  inscriptions: CourseEnrollment[];
  category?: string;
  niveau?: string;
  duree?: string;
  learningObjectives?: string[];
  requirements?: string[];
  notes?: string;
  ressources?: CourseResource[];
  sequentialProgression: boolean;
  unlockMessage?: string;
  createdAt: Date;
  updatedAt: Date;

  // Méthodes du schéma
  ajouterSection(section: Omit<CourseSection, 'courseId'>): void;
  supprimerSection(sectionId: string): void;
  obtenirSection(sectionId: string): CourseSection | undefined;
  ajouterChapitreASection(sectionId: string, chapitre: Omit<CourseChapter, 'sectionId'>): void;
  supprimerChapitreDSection(sectionId: string, chapterId: string): void;
  mettreAJourOrdreSections(nouveauxOrdres: { id: string; ordre: number }[]): void;
  mettreAJourOrdreChapitres(sectionId: string, nouveauxOrdres: { id: string; ordre: number }[]): void;
  obtenirNombreSections(): number;
  obtenirNombreChapitres(): number;
  obtenirNombreChapitresGratuits(): number;
  togglePublication(): boolean;
  ajouterInscription(enrollmentId: Types.ObjectId): void;
  supprimerInscription(enrollmentId: Types.ObjectId): void;
  obtenirNombreInscriptions(): number;
  ajouterRessource(ressource: CourseResource): void;
  supprimerRessource(ressourceId: string): void;
  
  // Méthodes pour la progression séquentielle
  activerProgressionSequentielle(message?: string): void;
  desactiverProgressionSequentielle(): void;
  obtenirChapitrePrecedent(chapitreId: string): CourseChapter | undefined;
  obtenirChapitreSuivant(chapitreId: string): CourseChapter | undefined;
  verifierAccesChapitre(chapitreId: string, progression: CourseProgress[]): { hasAccess: boolean; reason: string; requiredChapter?: CourseChapter };
}

/**
 * Interface pour le document CourseEnrollment
 */
export interface CourseEnrollmentDocument extends Document {
  _id: Types.ObjectId;
  id: string;
  userId: Types.ObjectId;
  courseId: Types.ObjectId;
  progression: CourseProgress[];
  enrolledAt: Date;
  completedAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  // Méthodes du schéma
  ajouterProgression(progression: CourseProgress): void;
  mettreAJourProgression(chapterId: string, progression: Partial<CourseProgress>): void;
  marquerChapitreComplete(chapterId: string): void;
  obtenirProgressionChapitre(chapterId: string): CourseProgress | undefined;
  calculerProgressionTotale(): number;
  marquerCoursComplete(): void;
}

/**
 * Interface pour le document CourseProgress
 */
export interface CourseProgressDocument extends Document {
  _id: Types.ObjectId;
  id: string;
  enrollmentId: Types.ObjectId;
  chapterId: string;
  isCompleted: boolean;
  watchTime: number;
  completedAt?: Date;
  lastAccessedAt: Date;
  createdAt: Date;
  updatedAt: Date;

  // Méthodes du schéma
  marquerComplete(): void;
  ajouterTempsVisionne(temps: number): void;
  mettreAJourDernierAcces(): void;
}

/**
 * Schéma Mongoose pour l'entité Cours
 */
@Schema({
  timestamps: true
})
export class Cours {
  _id: Types.ObjectId;

  /**
   * ID unique du cours (différent de l'_id MongoDB)
   */
  @Prop({
    required: true,
    type: String
  })
  id: string;

  /**
   * Titre du cours
   */
  @Prop({
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 200
  })
  titre: string;

  /**
   * Description du cours
   */
  @Prop({
    required: true,
    trim: true,
    maxlength: 2000
  })
  description: string;

  /**
   * Image miniature du cours
   */
  @Prop({
    trim: true
  })
  thumbnail?: string;

  /**
   * ID de la communauté à laquelle appartient le cours
   */
  @Prop({
    required: true,
    trim: true,
    type: String,
    ref: 'Community'
  })
  communityId: string;

  /**
   * Référence vers l'utilisateur créateur du cours
   */
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true
  })
  creatorId: Types.ObjectId;

  /**
   * Prix du cours
   */
  @Prop({
    type: Number,
    default: 0,
    min: 0
  })
  prix: number;

  /**
   * Indique si le cours est payant (true) ou gratuit (false)
   */
  @Prop({
    type: Boolean,
    default: false
  })
  isPaidCourse: boolean;

  /**
   * Devise du prix
   */
  @Prop({
    type: String,
    enum: ['USD', 'TND', 'EUR'],
    default: 'TND'
  })
  devise: string;

  /**
   * Configuration de prix avancée du cours
   */
  @Prop({
    type: {
      // Prix de base (legacy - keep for backward compatibility)
      price: { type: Number, default: 0, min: 0 },
      currency: { type: String, enum: ['USD', 'EUR', 'TND'], default: 'TND' },
      
      // Type de prix
      priceType: { type: String, enum: ['free', 'one-time', 'monthly', 'yearly'], default: 'free' },
      
      // Produit récurrent
      isRecurring: { type: Boolean, default: false },
      recurringInterval: { type: String, enum: ['month', 'year', 'week'] },
      
      // Fonctionnalités incluses
      features: [{ type: String }],
      
      // Options de paiement
      paymentOptions: {
        allowInstallments: { type: Boolean, default: false },
        installmentCount: { type: Number, min: 2, max: 12 },
        earlyBirdDiscount: { type: Number, min: 0, max: 100 },
        groupDiscount: { type: Number, min: 0, max: 100 },
        memberDiscount: { type: Number, min: 0, max: 100 }
      },
      
      // Période d'essai
      freeTrialDays: { type: Number, min: 0, max: 30 },
      trialFeatures: [{ type: String }]
    },
    default: {}
  })
  pricing?: {
    price: number;
    currency: string;
    priceType: 'free' | 'one-time' | 'monthly' | 'yearly';
    isRecurring: boolean;
    recurringInterval?: 'month' | 'year' | 'week';
    features: string[];
    paymentOptions: {
      allowInstallments: boolean;
      installmentCount?: number;
      earlyBirdDiscount?: number;
      groupDiscount?: number;
      memberDiscount?: number;
    };
    freeTrialDays?: number;
    trialFeatures?: string[];
  };

  /**
   * Indique si le cours est publié
   */
  @Prop({
    type: Boolean,
    default: false
  })
  isPublished: boolean;

  /**
   * Sections du cours
   */
  @Prop({
    type: [CourseSectionSchema],
    default: []
  })
  sections: CourseSection[];



  /**
   * Inscriptions au cours
   */
  @Prop({
    type: [Types.ObjectId],
    ref: 'CourseEnrollment',
    default: []
  })
  inscriptions: Types.ObjectId[];

  /**
   * Catégorie du cours
   */
  @Prop({
    trim: true,
    maxlength: 100
  })
  category?: string;

  /**
   * Niveau du cours
   */
  @Prop({
    trim: true,
    enum: ['débutant', 'intermédiaire', 'avancé', 'Débutant', 'Intermédiaire', 'Avancé']
  })
  niveau?: string;

  /**
   * Durée estimée du cours
   */
  @Prop({
    trim: true
  })
  duree?: string;

  /**
   * Objectifs d'apprentissage
   */
  @Prop({
    type: [String],
    default: []
  })
  learningObjectives?: string[];

  /**
   * Prérequis du cours
   */
  @Prop({
    type: [String],
    default: []
  })
  requirements?: string[];

  /**
   * Notes additionnelles
   */
  @Prop({
    trim: true
  })
  notes?: string;

  /**
   * Ressources du cours
   */
  @Prop({
    type: [CourseResourceSchema],
    default: []
  })
  ressources?: CourseResource[];

  /**
   * Progression séquentielle activée
   * Si true, les utilisateurs doivent compléter le chapitre précédent pour accéder au suivant
   */
  @Prop({
    type: Boolean,
    default: false
  })
  sequentialProgression: boolean;

  /**
   * Message personnalisé affiché quand un chapitre est verrouillé
   */
  @Prop({
    trim: true,
    maxlength: 500
  })
  unlockMessage?: string;

  /**
   * Note moyenne du cours
   */
  @Prop({ type: Number, default: 0 })
  averageRating: number;

  /**
   * Nombre de notes
   */
  @Prop({ type: Number, default: 0 })
  ratingCount: number;

  /**
   * Date de création
   */
  createdAt: Date;

  /**
   * Date de mise à jour
   */
  updatedAt: Date;
}

/**
 * Création du schéma Mongoose
 */
export const CoursSchema = SchemaFactory.createForClass(Cours);

// Index pour optimiser les requêtes
CoursSchema.index({ id: 1 }, { unique: true });
CoursSchema.index({ titre: 1 });
CoursSchema.index({ communityId: 1 });
CoursSchema.index({ creatorId: 1 });
CoursSchema.index({ isPublished: 1 });
CoursSchema.index({ prix: 1 });
CoursSchema.index({ category: 1 });
CoursSchema.index({ niveau: 1 });
CoursSchema.index({ createdAt: -1 });

// Index composés pour les requêtes complexes
CoursSchema.index({ communityId: 1, isPublished: 1 });
CoursSchema.index({ creatorId: 1, isPublished: 1 });
CoursSchema.index({ prix: 1, isPublished: 1 });
CoursSchema.index({ communityId: 1, category: 1 });
CoursSchema.index({ category: 1, niveau: 1 });

// Middleware pour générer l'ID unique avant sauvegarde
CoursSchema.pre('save', function(next) {
  if (this.isNew && !this.id) {
    this.id = new Types.ObjectId().toString();
  }
  
  // Trier les sections par ordre
  if (this.isModified('sections')) {
    this.sections.sort((a, b) => a.ordre - b.ordre);
    // Trier les chapitres dans chaque section
    this.sections.forEach(section => {
      section.chapitres.sort((a, b) => a.ordre - b.ordre);
    });
  }
  
  next();
});

// Validation personnalisée
CoursSchema.pre('validate', function(next) {
  if (this.prix > 0 && !this.devise) {
    next(new Error('La devise est obligatoire pour un cours payant'));
  }
  next();
});

// ============= MÉTHODES POUR LES SECTIONS =============

// Méthode pour ajouter une section
CoursSchema.methods.ajouterSection = function(section: Omit<CourseSection, 'courseId'>) {
  const nouvelleSection = {
    ...section,
    courseId: this.id,
    id: new Types.ObjectId().toString(),
    createdAt: new Date(),
    chapitres: section.chapitres || []
  };
  this.sections.push(nouvelleSection);
  this.sections.sort((a, b) => a.ordre - b.ordre);
};

// Méthode pour supprimer une section
CoursSchema.methods.supprimerSection = function(sectionId: string) {
  this.sections = this.sections.filter(section => section.id !== sectionId);
};

// Méthode pour obtenir une section par ID
CoursSchema.methods.obtenirSection = function(sectionId: string): CourseSection | undefined {
  return this.sections.find(section => section.id === sectionId);
};

// ============= MÉTHODES POUR LES CHAPITRES =============

// Méthode pour ajouter un chapitre à une section
CoursSchema.methods.ajouterChapitreASection = function(sectionId: string, chapitre: Omit<CourseChapter, 'sectionId'>) {
  console.log(`🔧 [ajouterChapitreASection] Tentative d'ajout du chapitre "${chapitre.titre}" à la section ${sectionId}`);
  console.log(`   📊 Sections disponibles: ${this.sections.length}`);
  this.sections.forEach((s, index) => {
    console.log(`      Section ${index + 1}: ID="${s.id}", Titre="${s.titre}", Chapitres actuels: ${s.chapitres.length}`);
  });
  
  const section = this.sections.find(s => s.id === sectionId);
  
  if (section) {
    console.log(`   ✅ Section trouvée: "${section.titre}"`);
    console.log(`   📄 Chapitre à ajouter:`, JSON.stringify({
      titre: chapitre.titre,
      ordre: chapitre.ordre,
      duree: chapitre.duree,
      isPaid: chapitre.isPreview !== undefined ? !chapitre.isPreview : 'N/A'
    }, null, 2));
    
    const nouveauChapitre = {
      ...chapitre,
      sectionId: sectionId,
      id: new Types.ObjectId().toString(),
      createdAt: new Date(),
      ressources: chapitre.ressources || []
    };
    
    section.chapitres.push(nouveauChapitre);
    section.chapitres.sort((a, b) => a.ordre - b.ordre);
    
    console.log(`   ✅ Chapitre ajouté avec succès ! Chapitres dans la section: ${section.chapitres.length}`);
    console.log(`   📋 Chapitres dans "${section.titre}":`, section.chapitres.map(c => `"${c.titre}"`));
  } else {
    console.log(`   ❌ ERREUR: Section avec ID "${sectionId}" non trouvée !`);
    console.log(`   🔍 IDs disponibles:`, this.sections.map(s => s.id));
  }
};

// Méthode pour supprimer un chapitre d'une section
CoursSchema.methods.supprimerChapitreDSection = function(sectionId: string, chapterId: string) {
  const section = this.sections.find(s => s.id === sectionId);
  if (section) {
    section.chapitres = section.chapitres.filter(chapitre => chapitre.id !== chapterId);
  }
};

// ============= MÉTHODES POUR L'ORDRE =============

// Méthode pour mettre à jour l'ordre des sections
CoursSchema.methods.mettreAJourOrdreSections = function(nouveauxOrdres: { id: string; ordre: number }[]) {
  nouveauxOrdres.forEach(({ id, ordre }) => {
    const section = this.sections.find(s => s.id === id);
    if (section) {
      section.ordre = ordre;
    }
  });
  this.sections.sort((a, b) => a.ordre - b.ordre);
};

// Méthode pour mettre à jour l'ordre des chapitres dans une section
CoursSchema.methods.mettreAJourOrdreChapitres = function(sectionId: string, nouveauxOrdres: { id: string; ordre: number }[]) {
  const section = this.sections.find(s => s.id === sectionId);
  if (section) {
    nouveauxOrdres.forEach(({ id, ordre }) => {
      const chapitre = section.chapitres.find(c => c.id === id);
      if (chapitre) {
        chapitre.ordre = ordre;
      }
    });
    section.chapitres.sort((a, b) => a.ordre - b.ordre);
  }
};

// ============= MÉTHODES DE COMPTAGE =============

// Méthode pour obtenir le nombre total de sections
CoursSchema.methods.obtenirNombreSections = function(): number {
  return this.sections.length;
};

// Méthode pour obtenir le nombre total de chapitres
CoursSchema.methods.obtenirNombreChapitres = function(): number {
  return this.sections.reduce((total, section) => total + section.chapitres.length, 0);
};

// Méthode pour obtenir le nombre de chapitres gratuits (preview)
CoursSchema.methods.obtenirNombreChapitresGratuits = function(): number {
  return this.sections.reduce((total, section) => {
    return total + section.chapitres.filter(chapitre => chapitre.isPreview).length;
  }, 0);
};

// ============= MÉTHODES DE PUBLICATION =============

// Méthode pour publier/dépublier le cours
CoursSchema.methods.togglePublication = function(): boolean {
  this.isPublished = !this.isPublished;
  return this.isPublished;
};

// ============= MÉTHODES POUR LES INSCRIPTIONS =============

// Méthode pour ajouter une inscription
CoursSchema.methods.ajouterInscription = function(enrollmentId: Types.ObjectId): void {
  if (!this.inscriptions.includes(enrollmentId)) {
    this.inscriptions.push(enrollmentId);
  }
};

// Méthode pour supprimer une inscription
CoursSchema.methods.supprimerInscription = function(enrollmentId: Types.ObjectId): void {
  this.inscriptions = this.inscriptions.filter(id => !id.equals(enrollmentId));
};

// Méthode pour obtenir le nombre d'inscriptions
CoursSchema.methods.obtenirNombreInscriptions = function(): number {
  return this.inscriptions.length;
};

// ============= MÉTHODES POUR LES RESSOURCES =============

// Méthode pour ajouter une ressource au cours
CoursSchema.methods.ajouterRessource = function(ressource: CourseResource): void {
  if (!ressource.id) {
    ressource.id = new Types.ObjectId().toString();
  }
  this.ressources = this.ressources || [];
  this.ressources.push(ressource);
  this.ressources.sort((a, b) => a.ordre - b.ordre);
};

// Méthode pour supprimer une ressource du cours
CoursSchema.methods.supprimerRessource = function(ressourceId: string): void {
  if (this.ressources) {
    this.ressources = this.ressources.filter(r => r.id !== ressourceId);
  }
};

// ============= SCHÉMAS POUR COURSEENROLLMENT =============

// Méthodes pour CourseEnrollment
CourseEnrollmentSchema.pre('save', function(next) {
  if (this.isNew && !this.id) {
    this.id = new Types.ObjectId().toString();
  }
  next();
});

CourseEnrollmentSchema.methods.ajouterProgression = function(progression: CourseProgress) {
  if (!progression.id) {
    progression.id = new Types.ObjectId().toString();
  }
  this.progression.push(progression);
};

CourseEnrollmentSchema.methods.mettreAJourProgression = function(chapterId: string, progression: Partial<CourseProgress>) {
  const index = this.progression.findIndex(p => p.chapterId === chapterId);
  if (index !== -1) {
    Object.assign(this.progression[index], progression);
  }
};

CourseEnrollmentSchema.methods.marquerChapitreComplete = function(chapterId: string) {
  const progression = this.progression.find(p => p.chapterId === chapterId);
  if (progression) {
    progression.isCompleted = true;
    progression.completedAt = new Date();
  }
};

CourseEnrollmentSchema.methods.obtenirProgressionChapitre = function(chapterId: string): CourseProgress | undefined {
  return this.progression.find(p => p.chapterId === chapterId);
};

CourseEnrollmentSchema.methods.calculerProgressionTotale = function(): number {
  if (this.progression.length === 0) return 0;
  const completed = this.progression.filter(p => p.isCompleted).length;
  return (completed / this.progression.length) * 100;
};

CourseEnrollmentSchema.methods.marquerCoursComplete = function() {
  this.completedAt = new Date();
};

// ============= SCHÉMAS POUR COURSEPROGRESS =============

// Méthodes pour CourseProgress
CourseProgressSchema.pre('save', function(next) {
  if (this.isNew && !this.id) {
    this.id = new Types.ObjectId().toString();
  }
  next();
});

CourseProgressSchema.methods.marquerComplete = function() {
  this.isCompleted = true;
  this.completedAt = new Date();
};

CourseProgressSchema.methods.ajouterTempsVisionne = function(temps: number) {
  this.watchTime += temps;
  this.lastAccessedAt = new Date();
};

CourseProgressSchema.methods.mettreAJourDernierAcces = function() {
  this.lastAccessedAt = new Date();
};

// ============= MÉTHODES POUR LA PROGRESSION SÉQUENTIELLE =============

// Méthode pour activer la progression séquentielle
CoursSchema.methods.activerProgressionSequentielle = function(message?: string) {
  this.sequentialProgression = true;
  if (message) {
    this.unlockMessage = message;
  }
};

// Méthode pour désactiver la progression séquentielle
CoursSchema.methods.desactiverProgressionSequentielle = function() {
  this.sequentialProgression = false;
  this.unlockMessage = undefined;
};

// Méthode pour obtenir le chapitre précédent
CoursSchema.methods.obtenirChapitrePrecedent = function(chapitreId: string): CourseChapter | undefined {
  // Trouver le chapitre actuel
  let chapitreActuel: CourseChapter | undefined;
  let sectionActuelle: CourseSection | undefined;
  
  for (const section of this.sections) {
    const chapitre = section.chapitres.find(c => c.id === chapitreId);
    if (chapitre) {
      chapitreActuel = chapitre;
      sectionActuelle = section;
      break;
    }
  }
  
  if (!chapitreActuel || !sectionActuelle) {
    return undefined;
  }
  
  // Si c'est le premier chapitre de la section
  if (chapitreActuel.ordre === 1) {
    // Chercher la section précédente
    const sectionsTriees = [...this.sections].sort((a, b) => a.ordre - b.ordre);
    const indexSectionActuelle = sectionsTriees.findIndex(s => s.id === sectionActuelle.id);
    
    if (indexSectionActuelle > 0) {
      const sectionPrecedente = sectionsTriees[indexSectionActuelle - 1];
      const chapitresTries = [...sectionPrecedente.chapitres].sort((a, b) => a.ordre - b.ordre);
      return chapitresTries[chapitresTries.length - 1]; // Dernier chapitre de la section précédente
    }
    
    return undefined; // Premier chapitre du cours
  } else {
    // Chapitre précédent dans la même section
    const chapitresTries = [...sectionActuelle.chapitres].sort((a, b) => a.ordre - b.ordre);
    const indexChapitreActuel = chapitresTries.findIndex(c => c.id === chapitreId);
    return chapitresTries[indexChapitreActuel - 1];
  }
};

// Méthode pour obtenir le chapitre suivant
CoursSchema.methods.obtenirChapitreSuivant = function(chapitreId: string): CourseChapter | undefined {
  // Trouver le chapitre actuel
  let chapitreActuel: CourseChapter | undefined;
  let sectionActuelle: CourseSection | undefined;
  
  for (const section of this.sections) {
    const chapitre = section.chapitres.find(c => c.id === chapitreId);
    if (chapitre) {
      chapitreActuel = chapitre;
      sectionActuelle = section;
      break;
    }
  }
  
  if (!chapitreActuel || !sectionActuelle) {
    return undefined;
  }
  
  // Si c'est le dernier chapitre de la section
  const chapitresTries = [...sectionActuelle.chapitres].sort((a, b) => a.ordre - b.ordre);
  const indexChapitreActuel = chapitresTries.findIndex(c => c.id === chapitreId);
  
  if (indexChapitreActuel === chapitresTries.length - 1) {
    // Chercher la section suivante
    const sectionsTriees = [...this.sections].sort((a, b) => a.ordre - b.ordre);
    const indexSectionActuelle = sectionsTriees.findIndex(s => s.id === sectionActuelle.id);
    
    if (indexSectionActuelle < sectionsTriees.length - 1) {
      const sectionSuivante = sectionsTriees[indexSectionActuelle + 1];
      const chapitresSuivants = [...sectionSuivante.chapitres].sort((a, b) => a.ordre - b.ordre);
      return chapitresSuivants[0]; // Premier chapitre de la section suivante
    }
    
    return undefined; // Dernier chapitre du cours
  } else {
    // Chapitre suivant dans la même section
    return chapitresTries[indexChapitreActuel + 1];
  }
};

// Méthode pour vérifier l'accès à un chapitre
CoursSchema.methods.verifierAccesChapitre = function(chapitreId: string, progression: CourseProgress[]): { hasAccess: boolean; reason: string; requiredChapter?: CourseChapter } {
  // Si la progression séquentielle n'est pas activée, accès libre
  if (!this.sequentialProgression) {
    return { hasAccess: true, reason: 'sequential_disabled' };
  }
  
  // Obtenir le chapitre précédent
  const chapitrePrecedent = this.obtenirChapitrePrecedent(chapitreId);
  
  // Si c'est le premier chapitre, accès libre
  if (!chapitrePrecedent) {
    return { hasAccess: true, reason: 'first_chapter' };
  }
  
  // Vérifier si le chapitre précédent est complété
  const progressionPrecedente = progression.find(p => p.chapterId === chapitrePrecedent.id);
  const isCompleted = progressionPrecedente?.isCompleted || false;
  
  return {
    hasAccess: isCompleted,
    reason: isCompleted ? 'previous_completed' : 'previous_not_completed',
    requiredChapter: chapitrePrecedent
  };
}; 