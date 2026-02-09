import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateChallengeDto, CreateChallengeResourceDto, CreateChallengeTaskDto } from './create-challenge.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsArray, ValidateNested, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO pour mettre à jour un défi
 * Hérite de CreateChallengeDto mais rend tous les champs optionnels
 */
export class UpdateChallengeDto extends PartialType(OmitType(CreateChallengeDto, ['resources', 'tasks', 'communitySlug'] as const)) {
  @ApiPropertyOptional({ description: 'Si le défi est actif', example: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Si la progression séquentielle est activée', example: true })
  @IsOptional()
  @IsBoolean()
  sequentialProgression?: boolean;

  @ApiPropertyOptional({ description: 'Ressources du défi', type: [CreateChallengeResourceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateChallengeResourceDto)
  resources?: CreateChallengeResourceDto[];

  @ApiPropertyOptional({ description: 'Tâches du défi', type: [CreateChallengeTaskDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateChallengeTaskDto)
  tasks?: CreateChallengeTaskDto[];
}
