import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpdateProductDto } from './update-product.dto';

describe('UpdateProductDto validation', () => {
  const makePipe = () =>
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

  it('accepts payloads that include isPublished', async () => {
    const pipe = makePipe();

    const result = await pipe.transform(
      { isPublished: true },
      {
        type: 'body',
        metatype: UpdateProductDto,
        data: '',
      },
    );

    expect(result).toEqual(expect.objectContaining({ isPublished: true }));
  });

  it('rejects unknown top-level fields like isActive', async () => {
    const pipe = makePipe();

    await expect(
      pipe.transform(
        { isPublished: true, isActive: true },
        {
          type: 'body',
          metatype: UpdateProductDto,
          data: '',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
