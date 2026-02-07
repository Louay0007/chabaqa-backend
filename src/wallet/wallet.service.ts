import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../schema/user.schema';
import { TopUpRequest, TopUpRequestDocument, TopUpRequestStatus, TopUpCurrency } from '../schema/topup-request.schema';
import { WalletTransaction, WalletTransactionDocument, WalletTransactionType, WalletPurchaseContentType } from '../schema/wallet-transaction.schema';
import { Community, CommunityDocument } from '../schema/community.schema';
import { Product, ProductDocument } from '../schema/product.schema';
import { Challenge, ChallengeDocument } from '../schema/challenge.schema';

// Live exchange rates API (you can use any free API)
const EXCHANGE_RATE_API = 'https://api.exchangerate-api.com/v4/latest/TND';

@Injectable()
export class WalletService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(TopUpRequest.name) private topUpRequestModel: Model<TopUpRequestDocument>,
    @InjectModel(WalletTransaction.name) private walletTransactionModel: Model<WalletTransactionDocument>,
    @InjectModel(Community.name) private communityModel: Model<CommunityDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Challenge.name) private challengeModel: Model<ChallengeDocument>,
  ) {}

  /**
   * Generate unique reference
   */
  private generateReference(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  }

  /**
   * Get live exchange rates
   */
  async getExchangeRates(): Promise<{ USD: number; EUR: number; DT: number }> {
    try {
      const response = await fetch(EXCHANGE_RATE_API);
      const data = await response.json();
      
      // API returns rates relative to TND (1 TND = X currency)
      // We need inverse: 1 USD = X TND
      return {
        DT: 1,
        USD: data.rates?.USD ? 1 / data.rates.USD : 3.1, // Fallback rate
        EUR: data.rates?.EUR ? 1 / data.rates.EUR : 3.4, // Fallback rate
      };
    } catch (error) {
      console.error('Failed to fetch exchange rates:', error);
      // Fallback rates (approximate)
      return {
        DT: 1,
        USD: 3.1,  // 1 USD ≈ 3.1 DT
        EUR: 3.4,  // 1 EUR ≈ 3.4 DT
      };
    }
  }

  /**
   * Get user wallet balance
   */
  async getWalletBalance(userId: string): Promise<{ balance: number; currency: string }> {
    const user = await this.userModel.findById(userId).select('walletBalance') as any;
    // Return 0 balance if user not found
    return {
      balance: user?.walletBalance || 0,
      currency: 'DT',
    };
  }

  /**
   * Get wallet transaction history
   */
  async getTransactionHistory(
    userId: string,
    options?: { page?: number; limit?: number; type?: WalletTransactionType }
  ) {
    const page = Math.max(1, options?.page || 1);
    const limit = Math.min(100, Math.max(1, options?.limit || 20));

    const query: any = { userId: new Types.ObjectId(userId) };
    if (options?.type) {
      query.type = options.type;
    }

    const [items, total] = await Promise.all([
      this.walletTransactionModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.walletTransactionModel.countDocuments(query),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Create a top-up request
   * NOTE: In test mode, requests are auto-approved immediately
   */
  async createTopUpRequest(
    userId: string,
    amount: number,
    currency: TopUpCurrency,
    paymentProofUrl: string,
    userNotes?: string,
  ): Promise<TopUpRequestDocument> {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    // Get exchange rates
    const rates = await this.getExchangeRates();
    const conversionRate = rates[currency] || 1;
    const amountDT = currency === TopUpCurrency.DT ? amount : amount * conversionRate;

    // PRODUCTION MODE: Requests require admin approval
    // Set to true only for testing/development
    const AUTO_APPROVE_TEST_MODE = false; // Changed to false for production

    const topUpRequest = new this.topUpRequestModel({
      userId: new Types.ObjectId(userId),
      originalAmount: amount,
      originalCurrency: currency,
      conversionRate,
      amountDT: Math.round(amountDT * 100) / 100, // Round to 2 decimals
      paymentProof: paymentProofUrl,
      userNotes,
      reference: this.generateReference('TOP'),
      status: AUTO_APPROVE_TEST_MODE ? TopUpRequestStatus.APPROVED : TopUpRequestStatus.PENDING,
      processedAt: AUTO_APPROVE_TEST_MODE ? new Date() : undefined,
      adminNotes: AUTO_APPROVE_TEST_MODE ? 'Auto-approved (Test Mode)' : undefined,
    });

    const savedRequest = await topUpRequest.save();

    // If auto-approved, add points to wallet immediately
    if (AUTO_APPROVE_TEST_MODE) {
      console.log('🧪 [TEST MODE] Auto-approving top-up request:', savedRequest._id);
      await this.addPointsToWallet(userId, savedRequest);
    } else {
      console.log('⏳ [PRODUCTION] Top-up request created, waiting for admin approval:', savedRequest._id);
    }

    return savedRequest;
  }

  /**
   * Add points to user wallet after approved top-up
   */
  private async addPointsToWallet(userId: string, topUpRequest: TopUpRequestDocument): Promise<void> {
    console.log('🔍 [WALLET] Looking for user:', userId);
    
    const user = await this.userModel.findById(userId) as any;
    if (!user) {
      console.error('❌ [WALLET] User not found for wallet update:', userId);
      // Try to find user by different methods
      const allUsers = await this.userModel.find({}).limit(5).select('_id email name');
      console.log('📋 [WALLET] Sample users in DB:', allUsers.map(u => ({ id: u._id, email: u.email })));
      return;
    }

    console.log('✅ [WALLET] Found user:', user.email || user.name);

    const balanceBefore = user.walletBalance || 0;
    const balanceAfter = balanceBefore + topUpRequest.amountDT;
    const totalBefore = user.totalPointsEarned || 0;
    const totalAfter = totalBefore + topUpRequest.amountDT;

    // Update user balance
    user.walletBalance = balanceAfter;
    user.totalPointsEarned = totalAfter;
    await user.save();

    // Create transaction record
    await this.walletTransactionModel.create({
      userId: new Types.ObjectId(userId),
      type: WalletTransactionType.TOPUP,
      amount: topUpRequest.amountDT,
      balanceBefore,
      balanceAfter,
      description: `Top-up of ${topUpRequest.originalAmount} ${topUpRequest.originalCurrency}`,
      topUpRequestId: topUpRequest._id,
      reference: this.generateReference('TXN'),
    });

    console.log(`✅ [WALLET] Added ${topUpRequest.amountDT} pts to user ${user.email || userId}. New balance: ${balanceAfter}`);
  }

  /**
   * Get user's top-up requests
   */
  async getUserTopUpRequests(
    userId: string,
    options?: { page?: number; limit?: number; status?: TopUpRequestStatus }
  ) {
    const page = Math.max(1, options?.page || 1);
    const limit = Math.min(100, Math.max(1, options?.limit || 20));

    const query: any = { userId: new Types.ObjectId(userId) };
    if (options?.status) {
      query.status = options.status;
    }

    const [items, total] = await Promise.all([
      this.topUpRequestModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.topUpRequestModel.countDocuments(query),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Admin: Get all pending top-up requests
   */
  async getPendingTopUpRequests(options?: { page?: number; limit?: number }) {
    const page = Math.max(1, options?.page || 1);
    const limit = Math.min(100, Math.max(1, options?.limit || 20));

    const query = { status: TopUpRequestStatus.PENDING };

    const [items, total] = await Promise.all([
      this.topUpRequestModel
        .find(query)
        .populate('userId', 'name email profile_picture photo_profil')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.topUpRequestModel.countDocuments(query),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Admin: Approve or reject a top-up request
   */
  async processTopUpRequest(
    requestId: string,
    adminId: string,
    action: 'approve' | 'reject',
    adminNotes?: string,
  ): Promise<TopUpRequestDocument> {
    const topUpRequest = await this.topUpRequestModel.findById(requestId);
    if (!topUpRequest) {
      throw new NotFoundException('Top-up request not found');
    }

    if (topUpRequest.status !== TopUpRequestStatus.PENDING) {
      throw new BadRequestException('This request has already been processed');
    }

    topUpRequest.processedBy = new Types.ObjectId(adminId);
    topUpRequest.processedAt = new Date();
    topUpRequest.adminNotes = adminNotes;

    if (action === 'approve') {
      topUpRequest.status = TopUpRequestStatus.APPROVED;

      // Add points to user wallet
      const user = await this.userModel.findById(topUpRequest.userId) as any;
      if (!user) {
        throw new NotFoundException('User not found');
      }

      const balanceBefore = user.walletBalance || 0;
      const balanceAfter = balanceBefore + topUpRequest.amountDT;
      const totalBefore = user.totalPointsEarned || 0;
      const totalAfter = totalBefore + topUpRequest.amountDT;

      // Update user balance
      user.walletBalance = balanceAfter;
      user.totalPointsEarned = totalAfter;
      await user.save();

      // Create transaction record
      await this.walletTransactionModel.create({
        userId: topUpRequest.userId,
        type: WalletTransactionType.TOPUP,
        amount: topUpRequest.amountDT,
        balanceBefore,
        balanceAfter,
        description: `Top-up of ${topUpRequest.originalAmount} ${topUpRequest.originalCurrency}`,
        topUpRequestId: topUpRequest._id,
        reference: this.generateReference('TXN'),
      });
    } else {
      topUpRequest.status = TopUpRequestStatus.REJECTED;
    }

    return topUpRequest.save();
  }


  /**
   * Purchase content with wallet balance
   * If FREE_MODE is enabled, grants access without payment
   */
  async purchaseWithWallet(
    userId: string,
    contentType: WalletPurchaseContentType,
    contentId: string,
    amountDT: number,
    creatorId: string,
    description?: string,
  ): Promise<{ success: boolean; transaction: WalletTransactionDocument; newBalance: number }> {
    const FREE_MODE = process.env.FREE_MODE === 'true';

    // If FREE_MODE is enabled, grant access without payment
    if (FREE_MODE) {
      console.log('💚 [FREE MODE] Granting free access to', contentType, contentId);
      
      // Grant access immediately
      await this.grantContentAccess(userId, contentType, contentId);

      // Create a mock transaction for record keeping
      const transaction = await this.walletTransactionModel.create({
        userId: new Types.ObjectId(userId),
        type: WalletTransactionType.PURCHASE,
        amount: 0, // Free!
        balanceBefore: 0,
        balanceAfter: 0,
        description: `Free access: ${description || contentType}`,
        contentType,
        contentId,
        reference: this.generateReference('FREE'),
      });

      return {
        success: true,
        transaction,
        newBalance: 0,
      };
    }

    // Normal payment flow (when FREE_MODE is disabled)
    const user = await this.userModel.findById(userId) as any;
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const currentBalance = user.walletBalance || 0;
    if (currentBalance < amountDT) {
      throw new BadRequestException(
        `Insufficient balance. You have ${currentBalance} DT but need ${amountDT} DT`
      );
    }

    const balanceBefore = currentBalance;
    const balanceAfter = currentBalance - amountDT;

    // Deduct from wallet
    user.walletBalance = balanceAfter;
    await user.save();

    // Create transaction record
    const transaction = await this.walletTransactionModel.create({
      userId: new Types.ObjectId(userId),
      type: WalletTransactionType.PURCHASE,
      amount: -amountDT, // Negative for debit
      balanceBefore,
      balanceAfter,
      description: description || `Purchase ${contentType}`,
      contentType,
      contentId,
      reference: this.generateReference('PUR'),
    });

    // Grant access based on content type
    await this.grantContentAccess(userId, contentType, contentId);

    return {
      success: true,
      transaction,
      newBalance: balanceAfter,
    };
  }

  /**
   * Grant access to content after successful wallet purchase
   */
  private async grantContentAccess(
    userId: string,
    contentType: WalletPurchaseContentType,
    contentId: string,
  ): Promise<void> {
    const userObjectId = new Types.ObjectId(userId);

    switch (contentType) {
      case WalletPurchaseContentType.COMMUNITY:
        const community = await this.communityModel.findById(contentId);
        if (community) {
          // Add user to community members
          if (!community.members.some(m => m.equals(userObjectId))) {
            community.members.push(userObjectId);
            community.membersCount = (community.membersCount || 0) + 1;
            await community.save();
          }
          // Add community to user's joined communities
          await this.userModel.findByIdAndUpdate(userId, {
            $addToSet: { joinedCommunities: community._id }
          });
          console.log(`✅ [WALLET] Granted community access to user ${userId} for community ${contentId}`);
        }
        break;

      case WalletPurchaseContentType.PRODUCT:
        // Find product by either _id or custom id field
        let product = await this.productModel.findById(contentId);
        if (!product) {
          product = await this.productModel.findOne({ id: contentId });
        }
        
        if (product) {
          // Add product to user's purchased products
          await this.userModel.findByIdAndUpdate(userId, {
            $addToSet: { purchasedProducts: product._id }
          });
          // Increment product sales
          product.sales = (product.sales || 0) + 1;
          await product.save();
          console.log(`✅ [WALLET] Granted product access to user ${userId} for product ${contentId}`);
        } else {
          console.error(`❌ [WALLET] Product not found: ${contentId}`);
        }
        break;

      case WalletPurchaseContentType.CHALLENGE:
        // Find challenge by either _id or custom id field
        let challenge = await this.challengeModel.findById(contentId) as ChallengeDocument;
        if (!challenge) {
          challenge = await this.challengeModel.findOne({ id: contentId }) as ChallengeDocument;
        }
        
        if (challenge) {
          // Check if user is already a participant
          const isAlreadyParticipant = challenge.participants.some(
            p => p.userId.toString() === userId || p.userId.equals(userObjectId)
          );
          
          if (!isAlreadyParticipant) {
            // Add user as participant
            const newParticipant = {
              id: new Types.ObjectId().toString(),
              userId: userObjectId,
              joinedAt: new Date(),
              isActive: true,
              progress: 0,
              totalPoints: 0,
              completedTasks: [],
              lastActivityAt: new Date(),
            };
            challenge.participants.push(newParticipant as any);
            await challenge.save();
            console.log(`✅ [WALLET] Added user ${userId} as participant to challenge ${contentId}`);
          } else {
            console.log(`ℹ️ [WALLET] User ${userId} is already a participant in challenge ${contentId}`);
          }
        } else {
          console.error(`❌ [WALLET] Challenge not found: ${contentId}`);
        }
        break;

      case WalletPurchaseContentType.EVENT:
        // Import Event model dynamically to avoid circular dependency
        const EventModel = this.userModel.db.model('Event');
        const event = await EventModel.findById(contentId);
        
        if (event) {
          // Check if user is already registered
          const isAlreadyRegistered = event.attendees?.some(
            (a: any) => a.userId?.toString() === userId || a.userId?.equals(userObjectId)
          );
          
          if (!isAlreadyRegistered) {
            // Add user as attendee
            if (!event.attendees) {
              event.attendees = [];
            }
            event.attendees.push({
              userId: userObjectId,
              ticketType: 'regular', // Default, should be passed from purchase
              registeredAt: new Date(),
              attended: false,
            });
            event.totalAttendees = (event.totalAttendees || 0) + 1;
            await event.save();
            console.log(`✅ [WALLET] Registered user ${userId} for event ${contentId}`);
          } else {
            console.log(`ℹ️ [WALLET] User ${userId} is already registered for event ${contentId}`);
          }
        } else {
          console.error(`❌ [WALLET] Event not found: ${contentId}`);
        }
        break;

      case WalletPurchaseContentType.COURSE:
        // Import Course model dynamically to avoid circular dependency
        const CourseModel = this.userModel.db.model('Course');
        const course = await CourseModel.findById(contentId);
        
        if (course) {
          // Check if user is already enrolled
          const isAlreadyEnrolled = course.enrolledUsers?.some(
            (userId_: any) => userId_?.toString() === userId || userId_?.equals(userObjectId)
          );
          
          if (!isAlreadyEnrolled) {
            // Add user to enrolled users
            if (!course.enrolledUsers) {
              course.enrolledUsers = [];
            }
            course.enrolledUsers.push(userObjectId);
            course.enrolledCount = (course.enrolledCount || 0) + 1;
            await course.save();
            console.log(`✅ [WALLET] Enrolled user ${userId} in course ${contentId}`);
          } else {
            console.log(`ℹ️ [WALLET] User ${userId} is already enrolled in course ${contentId}`);
          }
        } else {
          console.error(`❌ [WALLET] Course not found: ${contentId}`);
        }
        break;

      case WalletPurchaseContentType.SESSION:
        // Import Session model dynamically to avoid circular dependency
        const SessionModel = this.userModel.db.model('Session');
        const session = await SessionModel.findById(contentId);
        
        if (session) {
          // Check if user already has a booking
          const isAlreadyBooked = session.bookings?.some(
            (b: any) => b.userId?.toString() === userId || b.userId?.equals(userObjectId)
          );
          
          if (!isAlreadyBooked) {
            // Add booking
            if (!session.bookings) {
              session.bookings = [];
            }
            session.bookings.push({
              userId: userObjectId,
              bookedAt: new Date(),
              status: 'confirmed',
            });
            await session.save();
            console.log(`✅ [WALLET] Booked session ${contentId} for user ${userId}`);
          } else {
            console.log(`ℹ️ [WALLET] User ${userId} already has a booking for session ${contentId}`);
          }
        } else {
          console.error(`❌ [WALLET] Session not found: ${contentId}`);
        }
        break;
      
      default:
        console.log(`⚠️ [WALLET] Access grant not implemented for content type: ${contentType}`);
    }
  }

  /**
   * Refund a purchase back to wallet
   */
  async refundToWallet(
    userId: string,
    amountDT: number,
    orderId: string,
    description?: string,
  ): Promise<WalletTransactionDocument> {
    const user = await this.userModel.findById(userId) as any;
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const balanceBefore = user.walletBalance || 0;
    const balanceAfter = balanceBefore + amountDT;

    // Add back to wallet
    user.walletBalance = balanceAfter;
    await user.save();

    // Create transaction record
    return this.walletTransactionModel.create({
      userId: new Types.ObjectId(userId),
      type: WalletTransactionType.REFUND,
      amount: amountDT, // Positive for credit
      balanceBefore,
      balanceAfter,
      description: description || 'Refund',
      orderId: new Types.ObjectId(orderId),
      reference: this.generateReference('REF'),
    });
  }

  /**
   * Check if user has sufficient balance
   */
  async hasSufficientBalance(userId: string, amountDT: number): Promise<boolean> {
    const user = await this.userModel.findById(userId).select('walletBalance') as any;
    if (!user) {
      return false;
    }
    return (user.walletBalance || 0) >= amountDT;
  }

  /**
   * Get wallet summary for user
   */
  async getWalletSummary(userId: string) {
    const user = await this.userModel.findById(userId).select('walletBalance name email') as any;
    
    // If user not found, return default empty wallet
    if (!user) {
      return {
        balance: 0,
        currency: 'DT',
        stats: {
          totalTopUp: 0,
          totalSpent: 0,
          totalRefunded: 0,
          transactionCount: 0,
        },
        pendingTopUps: [],
        recentTransactions: [],
      };
    }

    // Get recent transactions
    const recentTransactions = await this.walletTransactionModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(5)
      .exec();

    // Get pending top-ups
    const pendingTopUps = await this.topUpRequestModel
      .find({ userId: new Types.ObjectId(userId), status: TopUpRequestStatus.PENDING })
      .sort({ createdAt: -1 })
      .exec();

    // Calculate total spent and total topped up
    const stats = await this.walletTransactionModel.aggregate([
      { $match: { userId: new Types.ObjectId(userId) } },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    const totalTopUp = stats.find(s => s._id === WalletTransactionType.TOPUP)?.total || 0;
    const totalSpent = Math.abs(stats.find(s => s._id === WalletTransactionType.PURCHASE)?.total || 0);
    const totalRefunded = stats.find(s => s._id === WalletTransactionType.REFUND)?.total || 0;

    return {
      balance: user.walletBalance || 0,
      currency: 'DT',
      stats: {
        totalTopUp,
        totalSpent,
        totalRefunded,
        transactionCount: stats.reduce((acc, s) => acc + s.count, 0),
      },
      pendingTopUps,
      recentTransactions,
    };
  }
}
