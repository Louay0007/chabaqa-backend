import { PartialType } from '@nestjs/mapped-types';
import { CreateSessionDto } from './create-session.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO pour mettre à jour une session
 * Hérite de CreateSessionDto mais rend tous les champs optionnels
 */
export class UpdateSessionDto extends PartialType(CreateSessionDto) {
  @ApiPropertyOptional({ description: 'Si la session est active', example: false })
  isActive?: boolean;
}
