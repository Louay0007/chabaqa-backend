import { Injectable, NestMiddleware, BadRequestException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';

@Injectable()
export class ValidationMiddleware implements NestMiddleware {
  async use(req: Request, res: Response, next: NextFunction) {
    // Cette fonction peut être étendue pour valider automatiquement les DTOs
    next();
  }
}

/**
 * Fonction utilitaire pour valider un DTO
 */
export async function validateDto(dto: any, data: any) {
  const dtoInstance = plainToClass(dto, data);
  const errors = await validate(dtoInstance);
  
  if (errors.length > 0) {
    const errorMessages = errors.map(error => 
      Object.values(error.constraints || {}).join(', ')
    );
    throw new BadRequestException(errorMessages);
  }
  
  return dtoInstance;
} 