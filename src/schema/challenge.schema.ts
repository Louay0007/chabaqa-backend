import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Sous-schéma pour les ressources d'un défi
 */
@Schema({ _id: false })
export class ChallengeResource {
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
  title: string;

  @Prop({
    required: true,
    enum: ['video', 'article', 'code', 'tool', 'pdf', 'link'],
    type: String
  })
  type: 'video' | 'article' | 'code' | 'tool' | 'pdf' | 'link';

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
  order: number;
}

export const ChallengeResourceSchema = SchemaFactory.createForClass(ChallengeResource);

/**
 * Sous-schéma pour les ressources d'une tâche de défi
 */
@Schema({ _id: false })
export class ChallengeTaskResource {
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
  title: string;

  @Prop({
    required: true,
    enum: ['video', 'article', 'code', 'tool'],
    type: String
  })
  type: 'video' | 'article' | 'code' | 'tool';

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
}

export const ChallengeTaskResourceSchema = SchemaFactory.createForClass(ChallengeTaskResource);

/**
 * Sous-schéma pour les tâches d'un défi
 */
@Schema({ _id: false })
export class ChallengeTask {
  @Prop({
    required: true,
    type: String
  })
  id: string;

  @Prop({
    required: true,
    type: Number,
    min: 1
  })
  day: number;

  @Prop({
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 200
  })
  title: string;

  @Prop({
    required: true,
    trim: true,
    maxlength: 2000
  })
  description: string;

  @Prop({
    required: true,
    trim: true,
    maxlength: 1000
  })
  deliverable: string;

  @Prop({
    type: Boolean,
    default: false
  })
  isCompleted: boolean;

  @Prop({
    type: Boolean,
    default: true
  })
  isActive: boolean;

  @Prop({
    type: Number,
    default: 0,
    min: 0
  })
  points: number;

  @Prop({
    type: [ChallengeTaskResourceSchema],
    default: []
  })
  resources: ChallengeTaskResource[];

  @Prop({
    required: true,
    trim: true
  })
  instructions: string;

  @Prop({
    trim: true
  })
  notes?: string;

  @Prop({
    type: Date,
    default: Date.now
  })
  createdAt: Date;
}

export const ChallengeTaskSchema = SchemaFactory.createForClass(ChallengeTask);

/**
 * Sous-schéma pour les participants d'un défi
 */
@Schema({ _id: false })
export class ChallengeParticipant {
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
    type: Date,
    default: Date.now
  })
  joinedAt: Date;

  @Prop({
    type: Boolean,
    default: true
  })
  isActive: boolean;

  @Prop({
    type: Number,
    default: 0,
    min: 0,
    max: 100
  })
  progress: number;

  @Prop({
    type: Number,
    default: 0,
    min: 0
  })
  totalPoints: number;

  @Prop({
    type: [String],
    default: []
  })
  completedTasks: string[];

  @Prop({
    type: Date,
    default: Date.now
  })
  lastActivityAt: Date;
}

export const ChallengeParticipantSchema = SchemaFactory.createForClass(ChallengeParticipant);

/**
 * Sous-schéma pour les commentaires d'un post de défi
 */
@Schema({ _id: false })
export class ChallengeComment {
  @Prop({
    required: true,
    type: String
  })
  id: string;

  @Prop({
    required: true,
    trim: true,
    maxlength: 1000
  })
  content: string;

  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'User'
  })
  userId: Types.ObjectId;

  @Prop({
    type: Date,
    default: Date.now
  })
  createdAt: Date;

  @Prop({
    type: Date,
    default: Date.now
  })
  updatedAt: Date;
}

export const ChallengeCommentSchema = SchemaFactory.createForClass(ChallengeComment);

/**
 * Sous-schéma pour les posts d'un défi
 */
@Schema({ _id: false })
export class ChallengePost {
  @Prop({
    required: true,
    type: String
  })
  id: string;

  @Prop({
    required: true,
    trim: true,
    maxlength: 2000
  })
  content: string;

  @Prop({
    type: [String],
    default: []
  })
  images: string[];

  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'User'
  })
  userId: Types.ObjectId;

  @Prop({
    type: Number,
    default: 0,
    min: 0
  })
  likes: number;

  @Prop({
    type: [ChallengeCommentSchema],
    default: []
  })
  comments: ChallengeComment[];

  @Prop({
    type: Date,
    default: Date.now
  })
  createdAt: Date;

  @Prop({
    type: Date,
    default: Date.now
  })
  updatedAt: Date;
}

export const ChallengePostSchema = SchemaFactory.createForClass(ChallengePost);

/**
 * Interface pour le document Challenge
 */
export interface ChallengeDocument extends Document {
  _id: Types.ObjectId;
  id: string;
  title: string;
  description: string;
  communityId: string;
  creatorId: Types.ObjectId;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  participants: ChallengeParticipant[];
  posts: ChallengePost[];
  createdAt: Date;
  updatedAt: Date;
  depositAmount?: number;
  maxParticipants?: number;
  completionReward?: number;
  topPerformerBonus?: number;
  streakBonus?: number;
  category?: string;
  difficulty?: string;
  duration?: string;
  thumbnail?: string;
  notes?: string;
  resources?: ChallengeResource[];
  tasks?: ChallengeTask[];
  sequentialProgression: boolean;
  unlockMessage?: string;
  pricing?: {
    participationFee: number;
    currency: string;
    depositAmount?: number;
    depositRequired: boolean;
    completionReward?: number;
    topPerformerBonus?: number;
    streakBonus?: number;
    isPremium: boolean;
    premiumFeatures: {
      personalMentoring: boolean;
      exclusiveResources: boolean;
      priorityFeedback: boolean;
      certificate: boolean;
      liveSessions: boolean;
      communityAccess: boolean;
    };
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

  // Méthodes du schéma
  addParticipant(userId: Types.ObjectId): void;
  removeParticipant(userId: Types.ObjectId): void;
  isParticipant(userId: Types.ObjectId): boolean;
  addTask(task: ChallengeTask): void;
  removeTask(taskId: string): void;
  addPost(post: ChallengePost): void;
  removePost(postId: string): void;
  updateParticipantProgress(userId: Types.ObjectId, progress: number): void;
  isChallengeActive(): boolean;
  getParticipantCount(): number;
  getCompletedTasksCount(): number;
  
  // Méthodes de pricing
  isFreeChallenge(): boolean;
  isPremiumChallenge(): boolean;
  getParticipationFee(): number;
  getDepositAmount(): number;
  calculateDiscount(userType: 'early-bird' | 'group' | 'member'): number;
  canUserAccess(userId: Types.ObjectId, hasPaid: boolean): boolean;
  
  // Méthodes pour la progression séquentielle
  activerProgressionSequentielle(message?: string): void;
  desactiverProgressionSequentielle(): void;
  obtenirTachePrecedente(taskId: string): ChallengeTask | undefined;
  obtenirTacheSuivante(taskId: string): ChallengeTask | undefined;
  verifierAccesTache(taskId: string, completedTasks: string[]): { hasAccess: boolean; reason: string; requiredTask?: ChallengeTask };
}

/**
 * Schéma Mongoose pour l'entité Challenge
 */
@Schema({
  timestamps: true
})
export class Challenge {
  _id: Types.ObjectId;

  /**
   * ID unique du défi (différent de l'_id MongoDB)
   */
  @Prop({
    required: true,
    type: String
  })
  id: string;

  /**
   * Titre du défi
   */
  @Prop({
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 200
  })
  title: string;

  /**
   * Description du défi
   */
  @Prop({
    required: true,
    trim: true,
    maxlength: 2000
  })
  description: string;

  /**
   * ID de la communauté à laquelle appartient le défi
   */
  @Prop({
    required: true,
    trim: true,
    type: String,
    ref: 'Community'
  })
  communityId: string;

  /**
   * Référence vers l'utilisateur créateur du défi
   */
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true
  })
  creatorId: Types.ObjectId;

  /**
   * Date de début du défi
   */
  @Prop({
    type: Date,
    required: true
  })
  startDate: Date;

  /**
   * Date de fin du défi
   */
  @Prop({
    type: Date,
    required: true
  })
  endDate: Date;

  /**
   * Indique si le défi est actif
   */
  @Prop({
    type: Boolean,
    default: true
  })
  isActive: boolean;

  /**
   * Participants au défi
   */
  @Prop({
    type: [ChallengeParticipantSchema],
    default: []
  })
  participants: ChallengeParticipant[];

  /**
   * Posts du défi
   */
  @Prop({
    type: [ChallengePostSchema],
    default: []
  })
  posts: ChallengePost[];

  /**
   * Montant de dépôt requis
   */
  @Prop({
    type: Number,
    min: 0
  })
  depositAmount?: number;

  /**
   * Nombre maximum de participants
   */
  @Prop({
    type: Number,
    min: 1
  })
  maxParticipants?: number;

  /**
   * Récompense de completion
   */
  @Prop({
    type: Number,
    min: 0
  })
  completionReward?: number;

  /**
   * Bonus pour le meilleur performer
   */
  @Prop({
    type: Number,
    min: 0
  })
  topPerformerBonus?: number;

  /**
   * Bonus de streak
   */
  @Prop({
    type: Number,
    min: 0
  })
  streakBonus?: number;

  /**
   * Catégorie du défi
   */
  @Prop({
    trim: true,
    maxlength: 100
  })
  category?: string;

  /**
   * Difficulté du défi
   */
  @Prop({
    enum: ['beginner', 'intermediate', 'advanced'],
    type: String
  })
  difficulty?: string;

  /**
   * Durée du défi
   */
  @Prop({
    trim: true
  })
  duration?: string;

  /**
   * Image miniature du défi
   */
  @Prop({
    trim: true
  })
  thumbnail?: string;

  /**
   * Notes additionnelles
   */
  @Prop({
    trim: true
  })
  notes?: string;

  /**
   * Ressources du défi
   */
  @Prop({
    type: [ChallengeResourceSchema],
    default: []
  })
  resources?: ChallengeResource[];

  /**
   * Tâches du défi
   */
  @Prop({
    type: [ChallengeTaskSchema],
    default: []
  })
  tasks?: ChallengeTask[];

  /**
   * Progression séquentielle activée
   * Si true, les utilisateurs doivent compléter la tâche précédente pour accéder à la suivante
   */
  @Prop({
    type: Boolean,
    default: false
  })
  sequentialProgression: boolean;

  /**
   * Message personnalisé affiché quand une tâche est verrouillée
   */
  @Prop({
    trim: true,
    maxlength: 500
  })
  unlockMessage?: string;

  /**
   * Configuration de prix du défi
   */
  @Prop({
    type: {
      // Prix de base
      price: { type: Number, default: 0, min: 0 },
      currency: { type: String, enum: ['USD', 'EUR', 'TND'], default: 'TND' },
      
      // Type de prix
      priceType: { type: String, enum: ['free', 'one-time', 'monthly', 'yearly'], default: 'free' },
      
      // Produit récurrent
      isRecurring: { type: Boolean, default: false },
      recurringInterval: { type: String, enum: ['month', 'year', 'week'] },
      
      // Prix de participation (legacy - keep for backward compatibility)
      participationFee: { type: Number, default: 0, min: 0 },
      
      // Système de dépôt
      depositAmount: { type: Number, min: 0 },
      depositRequired: { type: Boolean, default: false },
      
      // Système de récompenses
      completionReward: { type: Number, min: 0 },
      topPerformerBonus: { type: Number, min: 0 },
      streakBonus: { type: Number, min: 0 },
      
      // Défi premium
      isPremium: { type: Boolean, default: false },
      premiumFeatures: {
        personalMentoring: { type: Boolean, default: false },
        exclusiveResources: { type: Boolean, default: false },
        priorityFeedback: { type: Boolean, default: false },
        certificate: { type: Boolean, default: false },
        liveSessions: { type: Boolean, default: false },
        communityAccess: { type: Boolean, default: false }
      },
      
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
    participationFee: number;
    depositAmount?: number;
    depositRequired: boolean;
    completionReward?: number;
    topPerformerBonus?: number;
    streakBonus?: number;
    isPremium: boolean;
    premiumFeatures: {
      personalMentoring: boolean;
      exclusiveResources: boolean;
      priorityFeedback: boolean;
      certificate: boolean;
      liveSessions: boolean;
      communityAccess: boolean;
    };
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
   * Note moyenne du challenge
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
export const ChallengeSchema = SchemaFactory.createForClass(Challenge);

// Index pour optimiser les requêtes
ChallengeSchema.index({ id: 1 }, { unique: true });
ChallengeSchema.index({ title: 1 });
ChallengeSchema.index({ communityId: 1 });
ChallengeSchema.index({ creatorId: 1 });
ChallengeSchema.index({ isActive: 1 });
ChallengeSchema.index({ startDate: 1 });
ChallengeSchema.index({ endDate: 1 });
ChallengeSchema.index({ category: 1 });
ChallengeSchema.index({ difficulty: 1 });
ChallengeSchema.index({ createdAt: -1 });

// Index composés pour les requêtes complexes
ChallengeSchema.index({ communityId: 1, isActive: 1 });
ChallengeSchema.index({ creatorId: 1, isActive: 1 });
ChallengeSchema.index({ startDate: 1, endDate: 1 });
ChallengeSchema.index({ category: 1, difficulty: 1 });

// Middleware pour générer l'ID unique avant sauvegarde
ChallengeSchema.pre('save', function(next) {
  if (this.isNew && !this.id) {
    this.id = new Types.ObjectId().toString();
  }
  
  // Trier les tâches par jour
  if (this.isModified('tasks') && this.tasks) {
    this.tasks.sort((a, b) => a.day - b.day);
  }
  
  // Trier les ressources par ordre
  if (this.isModified('resources') && this.resources) {
    this.resources.sort((a, b) => a.order - b.order);
  }
  
  next();
});

// Validation personnalisée
ChallengeSchema.pre('validate', function(next) {
  if (this.startDate >= this.endDate) {
    next(new Error('La date de début doit être antérieure à la date de fin'));
  }
  
  if (this.maxParticipants && this.participants.length > this.maxParticipants) {
    next(new Error('Le nombre de participants ne peut pas dépasser le maximum autorisé'));
  }
  
  next();
});

// ============= MÉTHODES POUR LES PARTICIPANTS =============

// Méthode pour ajouter un participant
ChallengeSchema.methods.addParticipant = function(userId: Types.ObjectId): void {
  if (!this.isParticipant(userId)) {
    const participant: ChallengeParticipant = {
      id: new Types.ObjectId().toString(),
      userId: userId,
      joinedAt: new Date(),
      isActive: true,
      progress: 0,
      totalPoints: 0,
      completedTasks: [],
      lastActivityAt: new Date()
    };
    this.participants.push(participant);
  }
};

// Méthode pour supprimer un participant
ChallengeSchema.methods.removeParticipant = function(userId: Types.ObjectId): void {
  this.participants = this.participants.filter(participant => !participant.userId.equals(userId));
};

// Méthode pour vérifier si un utilisateur est participant
ChallengeSchema.methods.isParticipant = function(userId: Types.ObjectId): boolean {
  return this.participants.some(participant => participant.userId.equals(userId));
};

// Méthode pour mettre à jour le progrès d'un participant
ChallengeSchema.methods.updateParticipantProgress = function(userId: Types.ObjectId, progress: number): void {
  const participant = this.participants.find(p => p.userId.equals(userId));
  if (participant) {
    participant.progress = Math.min(100, Math.max(0, progress));
    participant.lastActivityAt = new Date();
  }
};

// ============= MÉTHODES POUR LES TÂCHES =============

// Méthode pour ajouter une tâche
ChallengeSchema.methods.addTask = function(task: ChallengeTask): void {
  if (!task.id) {
    task.id = new Types.ObjectId().toString();
  }
  this.tasks = this.tasks || [];
  this.tasks.push(task);
  this.tasks.sort((a, b) => a.day - b.day);
};

// Méthode pour supprimer une tâche
ChallengeSchema.methods.removeTask = function(taskId: string): void {
  this.tasks = this.tasks.filter(task => task.id !== taskId);
};

// ============= MÉTHODES POUR LES POSTS =============

// Méthode pour ajouter un post
ChallengeSchema.methods.addPost = function(post: ChallengePost): void {
  if (!post.id) {
    post.id = new Types.ObjectId().toString();
  }
  this.posts = this.posts || [];
  this.posts.push(post);
};

// Méthode pour supprimer un post
ChallengeSchema.methods.removePost = function(postId: string): void {
  this.posts = this.posts.filter(post => post.id !== postId);
};

// ============= MÉTHODES UTILITAIRES =============

// Méthode pour vérifier si le défi est actif
ChallengeSchema.methods.isChallengeActive = function(): boolean {
  const now = new Date();
  return this.isActive && this.startDate <= now && this.endDate >= now;
};

// Méthode pour obtenir le nombre de participants
ChallengeSchema.methods.getParticipantCount = function(): number {
  return this.participants.length;
};

// Méthode pour obtenir le nombre de tâches complétées
ChallengeSchema.methods.getCompletedTasksCount = function(): number {
  return this.tasks ? this.tasks.filter(task => task.isCompleted).length : 0;
};

// ============= MÉTHODES DE PRICING =============

// Méthode pour vérifier si le défi est gratuit
ChallengeSchema.methods.isFreeChallenge = function(): boolean {
  return !this.pricing || this.pricing.participationFee === 0;
};

// Méthode pour vérifier si le défi est premium
ChallengeSchema.methods.isPremiumChallenge = function(): boolean {
  return this.pricing && this.pricing.isPremium;
};

// Méthode pour obtenir le prix de participation
ChallengeSchema.methods.getParticipationFee = function(): number {
  return this.pricing ? this.pricing.participationFee : 0;
};

// Méthode pour obtenir le montant du dépôt
ChallengeSchema.methods.getDepositAmount = function(): number {
  return this.pricing && this.pricing.depositRequired ? this.pricing.depositAmount || 0 : 0;
};

// Méthode pour calculer les remises
ChallengeSchema.methods.calculateDiscount = function(userType: 'early-bird' | 'group' | 'member'): number {
  if (!this.pricing || !this.pricing.paymentOptions) return 0;
  
  const options = this.pricing.paymentOptions;
  switch (userType) {
    case 'early-bird':
      return options.earlyBirdDiscount || 0;
    case 'group':
      return options.groupDiscount || 0;
    case 'member':
      return options.memberDiscount || 0;
    default:
      return 0;
  }
};

// Méthode pour vérifier l'accès utilisateur
ChallengeSchema.methods.canUserAccess = function(userId: Types.ObjectId, hasPaid: boolean): boolean {
  // Si le défi est gratuit, accès libre
  if (this.isFreeChallenge()) return true;
  
  // Si l'utilisateur a payé, accès complet
  if (hasPaid) return true;
  
  // Si il y a une période d'essai et l'utilisateur n'a pas encore payé
  if (this.pricing && this.pricing.freeTrialDays && this.pricing.freeTrialDays > 0) {
    // Vérifier si l'utilisateur est dans la période d'essai
    const now = new Date();
    const trialEndDate = new Date(this.startDate.getTime() + (this.pricing.freeTrialDays * 24 * 60 * 60 * 1000));
    return now <= trialEndDate;
  }
  
  return false;
};

// ============= MÉTHODES POUR LA PROGRESSION SÉQUENTIELLE =============

// Méthode pour activer la progression séquentielle
ChallengeSchema.methods.activerProgressionSequentielle = function(message?: string) {
  this.sequentialProgression = true;
  if (message) {
    this.unlockMessage = message;
  }
};

// Méthode pour désactiver la progression séquentielle
ChallengeSchema.methods.desactiverProgressionSequentielle = function() {
  this.sequentialProgression = false;
  this.unlockMessage = undefined;
};

// Méthode pour obtenir la tâche précédente
ChallengeSchema.methods.obtenirTachePrecedente = function(taskId: string): ChallengeTask | undefined {
  if (!this.tasks || this.tasks.length === 0) {
    return undefined;
  }
  
  // Trier les tâches par jour
  const tasksTriees = [...this.tasks].sort((a, b) => a.day - b.day);
  
  // Trouver l'index de la tâche actuelle
  const indexActuel = tasksTriees.findIndex(task => task.id === taskId);
  
  if (indexActuel <= 0) {
    return undefined; // Première tâche ou tâche non trouvée
  }
  
  return tasksTriees[indexActuel - 1];
};

// Méthode pour obtenir la tâche suivante
ChallengeSchema.methods.obtenirTacheSuivante = function(taskId: string): ChallengeTask | undefined {
  if (!this.tasks || this.tasks.length === 0) {
    return undefined;
  }
  
  // Trier les tâches par jour
  const tasksTriees = [...this.tasks].sort((a, b) => a.day - b.day);
  
  // Trouver l'index de la tâche actuelle
  const indexActuel = tasksTriees.findIndex(task => task.id === taskId);
  
  if (indexActuel === -1 || indexActuel === tasksTriees.length - 1) {
    return undefined; // Dernière tâche ou tâche non trouvée
  }
  
  return tasksTriees[indexActuel + 1];
};

// Méthode pour vérifier l'accès à une tâche
ChallengeSchema.methods.verifierAccesTache = function(taskId: string, completedTasks: string[]): { hasAccess: boolean; reason: string; requiredTask?: ChallengeTask } {
  // Si la progression séquentielle n'est pas activée, accès libre
  if (!this.sequentialProgression) {
    return { hasAccess: true, reason: 'sequential_disabled' };
  }
  
  // Obtenir la tâche précédente
  const tachePrecedente = this.obtenirTachePrecedente(taskId);
  
  // Si c'est la première tâche, accès libre
  if (!tachePrecedente) {
    return { hasAccess: true, reason: 'first_task' };
  }
  
  // Vérifier si la tâche précédente est complétée
  const isCompleted = completedTasks.includes(tachePrecedente.id);
  
  return {
    hasAccess: isCompleted,
    reason: isCompleted ? 'previous_completed' : 'previous_not_completed',
    requiredTask: tachePrecedente
  };
};
