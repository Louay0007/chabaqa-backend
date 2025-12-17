import { PartialType } from '@nestjs/mapped-types';
import { CreateProductDto } from './create-product.dto';

/**
 * DTO pour mettre à jour un produit
 * Tous les champs sont optionnels
 */
export class UpdateProductDto extends PartialType(CreateProductDto) {}