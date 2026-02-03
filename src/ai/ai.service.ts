import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CoursService } from '../cours/cours.service';
import OpenAI from 'openai';

@Injectable()
export class AiService {
  private openai: OpenAI;

  constructor(
    private configService: ConfigService,
    private coursService: CoursService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENROUTER_API_KEY'),
      baseURL: this.configService.get<string>('OPENROUTER_BASE_URL'),
    });
  }

  async askChapterQuestion(courseId: string, chapterId: string, question: string) {
    // 1. Get Course and Chapter Data using CoursService
    // obtenirCours handles both ObjectId and string ID logic
    const course = await this.coursService.obtenirCours(courseId);
    if (!course) throw new NotFoundException('Course not found');

    type ChapterContext = {
      id?: string;
      titre?: string;
      title?: string;
      description?: string;
      content?: string;
      notes?: string;
    };

    type SectionContext = {
      id?: string;
      titre?: string;
      title?: string;
    };

    let targetChapter: ChapterContext | null = null;
    let targetSection: SectionContext | null = null;

    // Find the chapter in the DTO structure
    // CoursResponseDto structure: sections -> chapitres
    if (course.sections) {
      for (const section of course.sections) {
        if (section.chapitres) {
          const chapter = section.chapitres.find((c: any) => String(c.id) === chapterId);
          if (chapter) {
            targetChapter = chapter as any;
            targetSection = section as any;
            break;
          }
        }
      }
    }

    if (!targetChapter) throw new NotFoundException('Chapter not found');
    if (!targetSection) throw new NotFoundException('Section not found');

    const sectionTitle = String(targetSection.titre ?? targetSection.title ?? '');
    const chapterTitle = String(targetChapter.titre ?? targetChapter.title ?? '');
    const chapterDescription = String(targetChapter.description ?? targetChapter.content ?? '');
    const chapterNotes = String(targetChapter.notes ?? '');

    // 2. Build Context
    // Note: In the DTO, 'description' is often mapped from 'contenu'
    const context = `
      Course Title: ${course.titre}
      Section: ${sectionTitle}
      Chapter: ${chapterTitle}
      
      Content/Description:
      ${chapterDescription || 'No text content provided.'}
      
      Notes:
      ${chapterNotes || 'No notes provided.'}
    `;

    // 3. Call OpenRouter
    const model = this.configService.get<string>('AI_MODEL') || 'google/gemini-2.0-flash-lite-preview-02-05:free';
    
    try {
      const completion = await this.openai.chat.completions.create({
        model: model,
        messages: [
          {
            role: 'system',
            content: `You are a helpful teaching assistant for the course "${course.titre}". 
            Use the following context from the current chapter to answer the student's question. 
            If the answer is not in the context, use your general knowledge but mention that it's outside the provided material.
            Be concise and encouraging.
            
            Context:
            ${context}`
          },
          { role: 'user', content: question }
        ],
      });

      return {
        answer: completion.choices[0].message.content,
        chapterId: chapterId
      };
    } catch (error) {
      console.error('AI Service Error:', error);
      throw new Error('Failed to generate response from AI');
    }
  }
}
