import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Sous-schéma pour les variantes de produit
 */
@Schema({ _id: false })
export class ProductVariant {
  @Prop({
    required: true,
    type: String
  })
  id: string;

  @Prop({
    required: true,
    trim: true,
    maxlength: 100
  })
  name: string;

  @Prop({
    required: true,
    type: Number,
    min: 0
  })
  price: number;

  @Prop({
    trim: true,
    maxlength: 500
  })
  description?: string;

  @Prop({
    type: Number,
    default: 0,
    min: 0
  })
  inventory?: number;

  @Prop({
    type: Map,
    of: String
  })
  attributes?: Map<string, string>;
}

export const ProductVariantSchema = SchemaFactory.createForClass(ProductVariant);

/**
 * Sous-schéma pour les fichiers de produit
 */
@Schema({ _id: false })
export class ProductFile {
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
  name: string;

  @Prop({
    required: true,
    trim: true
  })
  url: string;

  @Prop({
    required: true,
    enum: ['Figma', 'PDF', 'SVG', 'PNG', 'JPG', 'ZIP', 'PSD', 'AI', 'SKETCH', 'XD', 'MP4', 'MP3', 'DOC', 'DOCX', 'PPT', 'PPTX', 'XLS', 'XLSX', 'TXT', 'MD', 'JSON', 'XML', 'CSS', 'JS', 'HTML', 'PHP', 'PY', 'JAVA', 'CPP', 'C', 'OTHER'],
    type: String
  })
  type: string;

  @Prop({
    type: String,
    trim: true
  })
  size?: string;

  @Prop({
    type: String,
    trim: true,
    maxlength: 500
  })
  description?: string;

  @Prop({
    type: Number,
    default: 0
  })
  order: number;

  @Prop({
    type: Number,
    default: 0
  })
  downloadCount: number;

  @Prop({
    type: Boolean,
    default: true
  })
  isActive: boolean;

  @Prop({
    type: Date,
    default: Date.now
  })
  uploadedAt: Date;
}

export const ProductFileSchema = SchemaFactory.createForClass(ProductFile);

/**
 * Schéma principal pour l'entité Product
 */
@Schema({
  timestamps: true,
  collection: 'products'
})
export class Product {
  _id: Types.ObjectId;

  /**
   * ID unique du produit (différent de l'_id MongoDB)
   */
  @Prop({
    required: true,
    type: String,
    unique: true
  })
  id: string;

  /**
   * Titre du produit
   */
  @Prop({
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 200
  })
  title: string;

  /**
   * Description du produit
   */
  @Prop({
    required: true,
    trim: true,
    maxlength: 2000
  })
  description: string;

  /**
   * Prix du produit
   */
  @Prop({
    required: true,
    type: Number,
    min: 0
  })
  price: number;

  /**
   * Devise du prix
   */
  @Prop({
    required: true,
    trim: true,
    enum: ['USD', 'EUR', 'TND'],
    type: String,
    default: 'TND'
  })
  currency: string;

  /**
   * ID de la communauté à laquelle appartient le produit
   */
  @Prop({
    required: true,
    trim: true,
    type: String,
    ref: 'Community'
  })
  communityId: string;

  /**
   * Référence vers l'utilisateur créateur du produit
   */
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true
  })
  creatorId: Types.ObjectId;

  /**
   * Indique si le produit est publié
   */
  @Prop({
    type: Boolean,
    default: true
  })
  isPublished: boolean;

  /**
   * Inventaire du produit (pour les produits physiques)
   */
  @Prop({
    type: Number,
    min: 0,
    default: 0
  })
  inventory?: number;

  /**
   * Nombre de ventes
   */
  @Prop({
    type: Number,
    default: 0,
    min: 0
  })
  sales: number;

  /**
   * Catégorie du produit
   */
  @Prop({
    required: true,
    trim: true,
    maxlength: 100
  })
  category: string;

  /**
   * Type de produit
   */
  @Prop({
    enum: ['digital', 'physical'],
    type: String,
    default: 'digital'
  })
  type?: 'digital' | 'physical';

  /**
   * Images du produit
   */
  @Prop({
    type: [String],
    default: []
  })
  images: string[];

  /**
   * Variantes du produit
   */
  @Prop({
    type: [ProductVariantSchema],
    default: []
  })
  variants?: ProductVariant[];

  /**
   * Fichiers du produit
   */
  @Prop({
    type: [ProductFileSchema],
    default: []
  })
  files?: ProductFile[];



  /**
   * Termes de licence
   */
  @Prop({
    trim: true,
    maxlength: 2000
  })
  licenseTerms?: string;

  /**
   * Indique si le produit est récurrent
   */
  @Prop({
    type: Boolean,
    default: false
  })
  isRecurring?: boolean;

  /**
   * Intervalle de récurrence
   */
  @Prop({
    enum: ['month', 'year', 'week'],
    type: String
  })
  recurringInterval?: 'month' | 'year' | 'week';

  /**
   * Fonctionnalités du produit
   */
  @Prop({
    type: [String],
    default: []
  })
  features?: string[];

  /**
   * Configuration de prix avancée du produit
   */
  @Prop({
    type: {
      // Prix de base (legacy - keep for backward compatibility)
      price: { type: Number, default: 0, min: 0 },
      currency: { type: String, enum: ['USD', 'EUR', 'TND'], default: 'TND' },
      
      // Type de prix
      priceType: { type: String, enum: ['free', 'one-time', 'monthly', 'yearly'], default: 'free' },
      
      // Produit récurrent (legacy - keep for backward compatibility)
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
   * Note moyenne du produit
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
  @Prop({
    type: Date,
    default: Date.now
  })
  createdAt: Date;

  /**
   * Date de dernière modification
   */
  @Prop({
    type: Date,
    default: Date.now
  })
  updatedAt: Date;
}

/**
 * Interface pour le document Product
 */
export interface ProductDocument extends Document {
  _id: Types.ObjectId;
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  communityId: string;
  creatorId: Types.ObjectId;
  isPublished: boolean;
  inventory?: number;
  sales: number;
  category: string;
  type?: 'digital' | 'physical';
  images: string[];
  variants?: ProductVariant[];
  files?: ProductFile[];
  rating?: number;
  licenseTerms?: string;
  isRecurring?: boolean;
  recurringInterval?: 'month' | 'year' | 'week';
  features?: string[];
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
  createdAt: Date;
  updatedAt: Date;
  
  // Methods
  addVariant(variant: ProductVariant): void;
  removeVariant(variantId: string): void;
  updateVariant(variantId: string, updates: Partial<ProductVariant>): void;
  addFile(file: ProductFile): void;
  removeFile(fileId: string): void;
  updateInventory(amount: number): boolean;
  incrementSales(amount?: number): void;
  getTotalVariants(): number;
  getTotalFiles(): number;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

// Index pour optimiser les requêtes
ProductSchema.index({ communityId: 1, isPublished: 1 });
ProductSchema.index({ creatorId: 1, isPublished: 1 });
ProductSchema.index({ category: 1, isPublished: 1 });
ProductSchema.index({ price: 1 });
ProductSchema.index({ sales: -1 });

ProductSchema.index({ createdAt: -1 });

// Middleware pour générer l'ID unique avant sauvegarde
ProductSchema.pre('save', function(next) {
  if (this.isNew && !this.id) {
    this.id = new Types.ObjectId().toString();
  }
  
  // Mettre à jour updatedAt
  this.updatedAt = new Date();
  
  // Trier les variantes par nom
  if (this.variants && this.variants.length > 0) {
    this.variants.sort((a, b) => a.name.localeCompare(b.name));
  }
  
  // Trier les fichiers par ordre
  if (this.files && this.files.length > 0) {
    this.files.sort((a, b) => a.order - b.order);
  }
  
  next();
});

// ============= MÉTHODES POUR LES VARIANTES =============

// Méthode pour ajouter une variante
ProductSchema.methods.addVariant = function(variant: ProductVariant): void {
  if (!variant.id) {
    variant.id = new Types.ObjectId().toString();
  }
  this.variants = this.variants || [];
  this.variants.push(variant);
  this.variants.sort((a, b) => a.name.localeCompare(b.name));
};

// Méthode pour supprimer une variante
ProductSchema.methods.removeVariant = function(variantId: string): void {
  this.variants = this.variants.filter(variant => variant.id !== variantId);
};

// Méthode pour mettre à jour une variante
ProductSchema.methods.updateVariant = function(variantId: string, updates: Partial<ProductVariant>): void {
  const variant = this.variants.find(v => v.id === variantId);
  if (variant) {
    Object.assign(variant, updates);
  }
};

// Méthode pour obtenir le nombre total de variantes
ProductSchema.methods.getTotalVariants = function(): number {
  return this.variants ? this.variants.length : 0;
};

// ============= MÉTHODES POUR LES FICHIERS =============

// Méthode pour ajouter un fichier
ProductSchema.methods.addFile = function(file: ProductFile): void {
  if (!file.id) {
    file.id = new Types.ObjectId().toString();
  }
  this.files = this.files || [];
  this.files.push(file);
  this.files.sort((a, b) => a.order - b.order);
};

// Méthode pour supprimer un fichier
ProductSchema.methods.removeFile = function(fileId: string): void {
  this.files = this.files.filter(file => file.id !== fileId);
};

// Méthode pour obtenir le nombre total de fichiers
ProductSchema.methods.getTotalFiles = function(): number {
  return this.files ? this.files.length : 0;
};

// ============= MÉTHODES POUR L'INVENTAIRE =============

// Méthode pour mettre à jour l'inventaire
ProductSchema.methods.updateInventory = function(amount: number): boolean {
  if (this.type === 'physical' && this.inventory !== undefined) {
    if (this.inventory + amount < 0) {
      return false; // Pas assez d'inventaire
    }
    this.inventory += amount;
    return true;
  }
  return false;
};

// Méthode pour incrémenter les ventes
ProductSchema.methods.incrementSales = function(amount: number = 1): void {
  this.sales += amount;
};