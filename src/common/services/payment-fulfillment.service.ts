import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument } from '../../schema/order.schema';
import { PaymentAuditService } from './payment-audit.service';

type ClaimState = 'claimed' | 'completed' | 'requires_booking' | 'processing' | 'missing' | 'unclaimed';

@Injectable()
export class PaymentFulfillmentService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    private readonly paymentAuditService: PaymentAuditService,
  ) {}

  async claimForProcessing(
    orderId: string,
    paymentMethod?: string,
    session: any = null,
  ): Promise<{ state: ClaimState; order: OrderDocument | null }> {
    if (!Types.ObjectId.isValid(orderId)) {
      return { state: 'missing', order: null };
    }

    const setOps: Record<string, any> = {
      status: 'paid',
      'metadata.fulfillmentStatus': 'processing',
      'metadata.fulfillmentStartedAt': new Date().toISOString(),
      'metadata.fulfillmentError': null,
    };
    if (paymentMethod) {
      setOps.paymentMethod = paymentMethod;
    }

    const claimQuery: any = {
      _id: new Types.ObjectId(orderId),
      $or: [
        { 'metadata.fulfillmentStatus': { $exists: false } },
        { 'metadata.fulfillmentStatus': { $in: ['pending', 'failed', 'requires_booking'] } },
      ],
    };

    let query = this.orderModel.findOneAndUpdate(
      claimQuery,
      { $set: setOps },
      { new: true },
    );
    if (session) {
      query = query.session(session);
    }
    const claimedOrder = await query.exec();
    if (claimedOrder) {
      await this.paymentAuditService.log(
        {
          orderId: claimedOrder._id,
          eventType: 'claimed',
          paymentMethod,
          nextStatus: String(claimedOrder.status || 'paid'),
          metadata: {
            fulfillmentStatus: claimedOrder.metadata?.fulfillmentStatus,
          },
        },
        session,
      );
      return { state: 'claimed', order: claimedOrder };
    }

    let readQuery = this.orderModel.findById(orderId);
    if (session) {
      readQuery = readQuery.session(session);
    }
    const existingOrder = await readQuery.exec();
    if (!existingOrder) {
      return { state: 'missing', order: null };
    }

    const fulfillmentStatus = String(existingOrder?.metadata?.fulfillmentStatus || '').toLowerCase();
    if (fulfillmentStatus === 'completed') {
      return { state: 'completed', order: existingOrder };
    }
    if (fulfillmentStatus === 'requires_booking') {
      return { state: 'requires_booking', order: existingOrder };
    }
    if (fulfillmentStatus === 'processing') {
      return { state: 'processing', order: existingOrder };
    }

    return { state: 'unclaimed', order: existingOrder };
  }

  async markCompleted(
    order: OrderDocument | any,
    session: any = null,
    metadataPatch?: Record<string, any>,
  ): Promise<OrderDocument | any> {
    const previousStatus = String(order.status || '');
    const nextMetadata: Record<string, any> = {
      ...(order.metadata || {}),
      ...(metadataPatch || {}),
      fulfillmentStatus: 'completed',
      fulfillmentCompletedAt: new Date().toISOString(),
      fulfillmentError: null,
    };
    delete nextMetadata.fulfillmentReason;
    delete nextMetadata.fulfillmentAction;

    order.status = 'paid';
    order.metadata = nextMetadata;
    await order.save(session ? { session } : undefined);
    await this.paymentAuditService.log(
      {
        orderId: order._id,
        eventType: 'completed',
        paymentMethod: order.paymentMethod,
        previousStatus,
        nextStatus: 'paid',
        metadata: {
          fulfillmentStatus: nextMetadata.fulfillmentStatus,
          fulfillmentCompletedAt: nextMetadata.fulfillmentCompletedAt,
        },
      },
      session,
    );
    return order;
  }

  async markRequiresBooking(
    order: OrderDocument | any,
    session: any = null,
    metadataPatch?: Record<string, any>,
  ): Promise<OrderDocument | any> {
    const previousStatus = String(order.status || '');
    order.status = 'paid';
    order.metadata = {
      ...(order.metadata || {}),
      ...(metadataPatch || {}),
      fulfillmentStatus: 'requires_booking',
      fulfillmentReason: 'missing_scheduledAt',
      fulfillmentAction: 'choose_session_slot',
      fulfillmentUpdatedAt: new Date().toISOString(),
    };
    await order.save(session ? { session } : undefined);
    await this.paymentAuditService.log(
      {
        orderId: order._id,
        eventType: 'requires_booking',
        paymentMethod: order.paymentMethod,
        previousStatus,
        nextStatus: order.status,
        reason: 'missing_scheduledAt',
        metadata: {
          fulfillmentStatus: order.metadata?.fulfillmentStatus,
          fulfillmentAction: order.metadata?.fulfillmentAction,
        },
      },
      session,
    );
    return order;
  }

  async markFailed(
    order: OrderDocument | any,
    error: any,
    session: any = null,
  ): Promise<OrderDocument | any> {
    const previousStatus = String(order.status || '');
    order.metadata = {
      ...(order.metadata || {}),
      fulfillmentStatus: 'failed',
      fulfillmentError: String(error?.message || error || 'Fulfillment failed'),
      fulfillmentUpdatedAt: new Date().toISOString(),
    };
    await order.save(session ? { session } : undefined);
    await this.paymentAuditService.log(
      {
        orderId: order._id,
        eventType: 'failed',
        paymentMethod: order.paymentMethod,
        previousStatus,
        nextStatus: order.status,
        error: String(error?.message || error || 'Fulfillment failed'),
        metadata: {
          fulfillmentStatus: order.metadata?.fulfillmentStatus,
        },
      },
      session,
    );
    return order;
  }
}
