import { PartialType } from '@nestjs/mapped-types';
import { CreateEventDto } from './create-event.dto';

/**
 * DTO pour mettre à jour un événement
 */
export class UpdateEventDto extends PartialType(CreateEventDto) {}

