import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument } from '../../schema/order.schema';

@Injectable()
export class ManualPaymentService {
    constructor(
        @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    ) { }

    /**
     * Generates a unique reference for manual payments
     */
    generateReference(): string {
        return `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }

    /**
     * Calculate potential fees or validations for manual payment
     * (Mostly a placeholder for now as logic mirrors standard payments)
     */
    async validateManualPayment(amount: number): Promise<boolean> {
        return amount > 0;
    }

    /**
     * Get pending manual payments for a creator
     */
    async getPendingPaymentsForCreator(creatorId: string) {
        // Ensure we are querying with a valid ObjectId if possible
        const query: any = {
            paymentMethod: 'manual',
            status: 'pending_verification'
        };

        try {
            if (Types.ObjectId.isValid(creatorId)) {
                query.creatorId = new Types.ObjectId(creatorId);
            } else {
                query.creatorId = creatorId;
            }
        } catch (e) {
            query.creatorId = creatorId;
        }

        return this.orderModel.find(query)
            .populate('buyerId', 'name email profile_picture')
            .sort({ createdAt: -1 })
            .exec();
    }

    async getManualPaymentsHistoryForCreator(
        creatorId: string,
        options?: {
            status?: string;
            page?: number;
            limit?: number;
        }
    ) {
        const page = Math.max(1, Number(options?.page || 1));
        const limit = Math.min(100, Math.max(1, Number(options?.limit || 20)));

        const query: any = {
            paymentMethod: 'manual',
        };

        if (options?.status && options.status !== 'all') {
            query.status = options.status;
        }

        try {
            if (Types.ObjectId.isValid(creatorId)) {
                query.creatorId = new Types.ObjectId(creatorId);
            } else {
                query.creatorId = creatorId;
            }
        } catch (e) {
            query.creatorId = creatorId;
        }

        const [items, total] = await Promise.all([
            this.orderModel
                .find(query)
                .populate('buyerId', 'name email profile_picture')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .exec(),
            this.orderModel.countDocuments(query),
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
     * Verify a manual payment (Approve or Reject)
     */
    async verifyPayment(orderId: string, creatorId: string, action: 'approve' | 'reject'): Promise<OrderDocument> {
        const query: any = {
            _id: orderId,
            paymentMethod: 'manual',
            status: 'pending_verification'
        };

        if (Types.ObjectId.isValid(creatorId)) {
            query.creatorId = new Types.ObjectId(creatorId);
        } else {
            query.creatorId = creatorId;
        }

        const order = await this.orderModel.findOne(query);

        if (!order) {
            throw new Error('Order not found or access denied');
        }

        if (action === 'approve') {
            order.status = 'paid';
            // Here you might want to trigger logic to grant access if it's not handled automatically by order status listeners
            // But usually, the application checks order status 'paid' to grant access.
        } else {
            order.status = 'cancelled';
        }

        return order.save();
    }
}
