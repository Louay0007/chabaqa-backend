import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Model, Types } from 'mongoose';

export enum UserRole {
  ADMIN = 'admin',
}

export interface AdminDocument extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
  numtel: string;
  date_naissance: Date;
  sexe: string;
  pays: string;
  ville: string;
  code_postal: string;
  adresse: string;
  photo_profil: string;
  poste: string;
  departement: string;
}

@Schema({
  timestamps: { createdAt: true, updatedAt: false }
})
export class Admin {
  _id: Types.ObjectId;

  @Prop({
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100
  })
  name: string;

  @Prop({
    required: true,
    trim: true,
    lowercase: true
  })
  email: string;

  @Prop({
    required: true,
    minlength: 8
  })
  password: string;

  @Prop({
    required: true,
    type: String,
    enum: UserRole,
    default: UserRole.ADMIN
  })
  role: UserRole;

  @Prop({
    required: false,
    type: Date,
    default: Date.now
  })
  createdAt: Date;

  @Prop({
    required: false,
    type: Date,
    default: Date.now
  })
  updatedAt: Date;

  @Prop({
    required: false,
  })
  numtel: string;

  @Prop({
    required: false,
  })
  date_naissance: Date;

  @Prop({
    required: false,
  })
  sexe: string;

  @Prop({
    required: false,
  })
  pays: string;

  @Prop({
    required: false,
  })
  ville: string;

  @Prop({
    required: false,
  })
  code_postal: string;

  @Prop({
    required: false,
  })
  adresse: string;

  @Prop({
    required: false,
  })
  photo_profil: string;

  @Prop({
    required: false,
  })
  poste: string;

  @Prop({
    required: false,
  })
  departement: string;


}

export const AdminSchema = SchemaFactory.createForClass(Admin);

AdminSchema.index({ email: 1 }, { unique: true });
AdminSchema.index({ role: 1 });
AdminSchema.index({ createdAt: -1 });

AdminSchema.methods.toJSON = function(): any {
  const adminObject = this.toObject();
  delete adminObject.password;
  return adminObject;
};

export type AdminModel = Model<AdminDocument>;

