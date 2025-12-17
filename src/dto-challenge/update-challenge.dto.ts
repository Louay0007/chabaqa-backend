import { PartialType } from '@nestjs/mapped-types';
import { CreateChallengeDto } from './create-challenge.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO pour mettre à jour un défi
 * Hérite de CreateChallengeDto mais rend tous les champs optionnels
 */
export class UpdateChallengeDto extends PartialType(CreateChallengeDto) {
  @ApiPropertyOptional({ description: 'Si le défi est actif', example: false })
  isActive?: boolean;
}
