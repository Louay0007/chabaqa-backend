import { ProductController } from './product.controller';

describe('ProductController by-user visibility forwarding', () => {
  const makeController = () => {
    const productService = {
      findByCreator: jest.fn().mockResolvedValue({
        products: [],
        pagination: { page: 1, limit: 12, total: 0, totalPages: 0 },
      }),
    };

    const controller = new ProductController(productService as any);
    return { controller, productService };
  };

  it('forwards owner visibility when requester matches route userId', async () => {
    const { controller, productService } = makeController();
    await controller.findByUser(
      '507f1f77bcf86cd799439011',
      1,
      12,
      'all',
      { user: { _id: '507f1f77bcf86cd799439011' } },
    );

    expect(productService.findByCreator).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      1,
      12,
      'all',
      'owner',
    );
  });

  it('forwards public visibility for anonymous or different requester', async () => {
    const { controller, productService } = makeController();
    await controller.findByUser(
      '507f1f77bcf86cd799439011',
      1,
      12,
      'all',
      undefined as any,
    );

    expect(productService.findByCreator).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      1,
      12,
      'all',
      'public',
    );
  });
});
