import { Model, Types } from 'mongoose';

export function slugifyFullNameToUsername(name: string): string {
  const normalized = String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');

  return normalized || 'user';
}

export async function generateUniqueUsername(
  userModel: Model<any>,
  fullName: string,
  excludeUserId?: string | Types.ObjectId,
): Promise<string> {
  const base = slugifyFullNameToUsername(fullName);
  let candidate = base;
  let suffix = 2;

  while (true) {
    const query: any = { username: candidate };

    if (excludeUserId && Types.ObjectId.isValid(String(excludeUserId))) {
      query._id = { $ne: new Types.ObjectId(String(excludeUserId)) };
    }

    const existing = await userModel.findOne(query).select('_id').lean();
    if (!existing) {
      return candidate;
    }

    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}
