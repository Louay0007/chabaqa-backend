import { ForbiddenException } from '@nestjs/common';
import { ProductService } from './product.service';

describe('ProductService publish hardening', () => {
  const creatorUserId = '507f1f77bcf86cd799439011';

  const makeService = (options?: {
    hasSubscription?: boolean;
    communityCreatorId?: string;
    product?: any;
  }) => {
    let createdProductDoc: any;

    const productModel: any = function ProductModel(this: any, data: any) {
      Object.assign(this, data);
      this._id = this._id || 'product-mongo-id';
      this.save = jest.fn().mockResolvedValue(this);
      createdProductDoc = this;
    };

    productModel.findById = jest.fn().mockReturnValue({
      populate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ id: 'product-id', communityId: 'community-1' }),
      }),
    });

    productModel.findOne = jest.fn().mockResolvedValue(options?.product || null);

    const communityModel: any = {
      findOne: jest.fn().mockResolvedValue({
        createur: {
          toString: () => options?.communityCreatorId || creatorUserId,
        },
        id: 'community-1',
        slug: 'community-one',
      }),
    };

    const policyService = {
      hasActiveSubscription: jest
        .fn()
        .mockResolvedValue(options?.hasSubscription ?? true),
    };

    const service = new ProductService(
      productModel,
      communityModel,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      policyService as any,
      {} as any,
      {} as any,
    );

    jest
      .spyOn(service as any, 'transformToResponseDto')
      .mockResolvedValue({ id: 'product-id' } as any);

    return {
      service,
      productModel,
      communityModel,
      policyService,
      getCreatedProductDoc: () => createdProductDoc,
    };
  };

  it('create() defaults products to draft when isPublished is omitted', async () => {
    const { service, policyService, getCreatedProductDoc } = makeService({
      hasSubscription: true,
    });

    await service.create(
      {
        title: 'Draft product',
        description: 'Test product',
        price: 10,
        communityId: 'community-1',
        category: 'General',
      } as any,
      creatorUserId,
    );

    const created = getCreatedProductDoc();
    expect(created).toBeDefined();
    expect(created.isPublished).toBe(false);
    expect(policyService.hasActiveSubscription).not.toHaveBeenCalled();
  });

  it('create() blocks publish on create without active subscription', async () => {
    const { service, getCreatedProductDoc } = makeService({
      hasSubscription: false,
    });

    await expect(
      service.create(
        {
          title: 'Publish attempt',
          description: 'Test product',
          price: 10,
          communityId: 'community-1',
          category: 'General',
          isPublished: true,
        } as any,
        creatorUserId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(getCreatedProductDoc()).toBeUndefined();
  });

  it('update() blocks draft-to-published transition without active subscription', async () => {
    const product = {
      id: 'product-1',
      creatorId: { toString: () => creatorUserId },
      isPublished: false,
      communityId: 'community-1',
      save: jest.fn(),
    };

    const { service } = makeService({
      hasSubscription: false,
      product,
    });

    await expect(
      service.update('product-1', { isPublished: true } as any, creatorUserId),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(product.save).not.toHaveBeenCalled();
  });

  it('togglePublished() blocks publishing without active subscription', async () => {
    const product = {
      id: 'product-1',
      creatorId: { toString: () => creatorUserId },
      isPublished: false,
      save: jest.fn(),
    };

    const { service } = makeService({
      hasSubscription: false,
      product,
    });

    await expect(
      service.togglePublished('product-1', creatorUserId),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(product.save).not.toHaveBeenCalled();
  });

  it('togglePublished() publishes successfully when subscription is active', async () => {
    const product = {
      id: 'product-1',
      creatorId: { toString: () => creatorUserId },
      isPublished: false,
      save: jest.fn().mockResolvedValue(true),
    };

    const { service } = makeService({
      hasSubscription: true,
      product,
    });

    const result = await service.togglePublished('product-1', creatorUserId);

    expect(product.save).toHaveBeenCalled();
    expect(product.isPublished).toBe(true);
    expect(result).toEqual(
      expect.objectContaining({ isPublished: true }),
    );
  });
});

describe('ProductService by-user listing', () => {
  const creatorUserId = '507f1f77bcf86cd799439011';

  const makeListingService = () => {
    const productModel: any = {
      find: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([
                  {
                    id: 'product-1',
                    slug: 'product-slug',
                    communityId: 'community-custom-id',
                    creatorId: { toString: () => creatorUserId },
                  },
                ]),
              }),
            }),
          }),
        }),
      }),
      countDocuments: jest.fn().mockResolvedValue(1),
    };

    const communityModel: any = {
      find: jest.fn().mockResolvedValue([
        { _id: { toString: () => 'mongo-community-id' }, id: 'community-custom-id', name: 'Tech Community', slug: 'tech-community' },
      ]),
    };

    const service = new ProductService(
      productModel,
      communityModel,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    jest.spyOn(service as any, 'transformToResponseDto').mockResolvedValue({
      id: 'product-1',
      title: 'My Product',
      slug: 'product-slug',
      community: { id: 'community-custom-id', name: 'Tech Community', slug: 'tech-community' },
    } as any);

    return { service, productModel };
  };

  it('ignores type=all and keeps owner visibility without isPublished filter', async () => {
    const { service, productModel } = makeListingService();

    const result = await service.findByCreator(creatorUserId, 1, 12, 'all', 'owner');

    expect(productModel.find).toHaveBeenCalledWith(expect.not.objectContaining({ type: 'all' }));
    expect(productModel.find).toHaveBeenCalledWith(expect.not.objectContaining({ isPublished: true }));
    expect(result.products[0]).toEqual(expect.objectContaining({
      communityName: 'Tech Community',
      communitySlug: 'tech-community',
      slug: 'tech-community',
      productSlug: 'product-slug',
    }));
  });

  it('applies published-only filter for public visibility', async () => {
    const { service, productModel } = makeListingService();

    await service.findByCreator(creatorUserId, 1, 12, undefined, 'public');

    expect(productModel.find).toHaveBeenCalledWith(expect.objectContaining({ isPublished: true }));
  });
});
