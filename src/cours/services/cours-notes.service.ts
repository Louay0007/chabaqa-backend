import { Injectable } from '@nestjs/common';
import { CoursService } from '../cours.service';
import { CreateUserNoteDto, UpdateUserNoteDto } from '../../dto-cours/user-note.dto';

@Injectable()
export class CoursNotesService {
  constructor(private readonly coursService: CoursService) {}

  createUserNote(userId: string, courseId: string, createDto: CreateUserNoteDto) {
    return this.coursService.createUserNote(userId, courseId, createDto);
  }

  getUserNotes(userId: string, courseId: string) {
    return this.coursService.getUserNotes(userId, courseId);
  }

  updateUserNote(userId: string, noteId: string, updateDto: UpdateUserNoteDto) {
    return this.coursService.updateUserNote(userId, noteId, updateDto);
  }

  deleteUserNote(userId: string, noteId: string) {
    return this.coursService.deleteUserNote(userId, noteId);
  }
}
