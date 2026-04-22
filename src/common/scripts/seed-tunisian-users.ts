import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument, UserRole, AuthProvider } from '../../schema/user.schema';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class SeedTunisianUsers implements OnModuleInit {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async onModuleInit() {
    // Check if seed users already exist
    const existingSeedUsers = await this.userModel.countDocuments({
      email: { $regex: '@email\\.tn$' }
    });
    
    if (existingSeedUsers > 0) {
      console.log(`ℹ️  Database already has ${existingSeedUsers} seed users, skipping.`);
      return;
    }
    
    console.log('🌱 Seeding Tunisian users...');
    await this.seedUsers();
  }

  private tunisianUsers = [
    {
      name: 'Ahmed Ben Ali',
      username: 'ahmedbenali',
      email: 'ahmed.benali@email.tn',
      password: 'Password123!',
      ville: 'Tunis',
      pays: 'Tunisie',
      bio: 'Développeur full-stack passionné par les nouvelles technologies et le partage de connaissances.',
      role: UserRole.CREATOR,
      socialLinks: {
        linkedin: 'linkedin.com/in/ahmedbenali',
        github: 'github.com/ahmedbenali',
      }
    },
    {
      name: 'Fatma Mseddi',
      username: 'fatmamseddi',
      email: 'fatma.mseddi@email.tn',
      password: 'Password123!',
      ville: 'Sfax',
      pays: 'Tunisie',
      bio: 'Designer UI/UX et créative digitale. Jadore créer des expériences utilisateur exceptionnelles.',
      role: UserRole.CREATOR,
      socialLinks: {
        instagram: 'fatmamseddi',
        behance: 'behance.net/fatma',
      }
    },
    {
      name: 'Mohamed Trabelsi',
      username: 'mohamedtrabelsi',
      email: 'mohamed.trabelsi@email.tn',
      password: 'Password123!',
      ville: 'Sousse',
      pays: 'Tunisie',
      bio: 'Entrepreneur tech et mentor en startup. Fondateur de plusieurs projets innovants en Tunisie.',
      role: UserRole.CREATOR,
      socialLinks: {
        linkedin: 'linkedin.com/in/mohamedtrabelsi',
        twitter: '@mtrabelsi',
      }
    },
    {
      name: 'Sarra Khemiri',
      username: 'sarrakhemiri',
      email: 'sarra.khemiri@email.tn',
      password: 'Password123!',
      ville: 'Tunis',
      pays: 'Tunisie',
      bio: 'Data Scientist et analyste. Passionnée par lIA et le machine learning.',
      role: UserRole.CREATOR,
      socialLinks: {
        linkedin: 'linkedin.com/in/sarrakhemiri',
        github: 'github.com/sarra',
      }
    },
    {
      name: 'Youssef Bouallegue',
      username: 'youssefbouallegue',
      email: 'youssef.bouallegue@email.tn',
      password: 'Password123!',
      ville: 'Kairouan',
      pays: 'Tunisie',
      bio: 'Développeur mobile et tech enthusiast. Spécialisé en React Native et Flutter.',
      role: UserRole.CREATOR,
      socialLinks: {
        github: 'github.com/youssefba',
        twitter: '@ybouallegue',
      }
    },
    {
      name: 'Nesrine Hadded',
      username: 'nesrinehadded',
      email: 'nesrine.hadded@email.tn',
      password: 'Password123!',
      ville: 'Monastir',
      pays: 'Tunisie',
      bio: 'Marketing digital etGrowth Hacker. Experte en stratégies de croissance et réseaux sociaux.',
      role: UserRole.CREATOR,
      socialLinks: {
        instagram: 'nesrinehadded',
        linkedin: 'linkedin.com/in/nesrinehadded',
      }
    },
    {
      name: 'Bilel Hamdi',
      username: 'bilelhamdi',
      email: 'bilel.hamdi@email.tn',
      password: 'Password123!',
      ville: 'Gabès',
      pays: 'Tunisie',
      bio: 'Ingénieur logiciel et formateur. Passionné par lopensource et la communauté tech.',
      role: UserRole.CREATOR,
      socialLinks: {
        github: 'github.com/bilelhamdi',
        linkedin: 'linkedin.com/in/bilelhamdi',
      }
    },
    {
      name: 'Mariem Ben Ammar',
      username: 'mariembenammar',
      email: 'mariem.benammar@email.tn',
      password: 'Password123!',
      ville: 'Tunis',
      pays: 'Tunisie',
      bio: 'Chef de projet digital etScrum Master. Adepte des méthodologies agiles.',
      role: UserRole.CREATOR,
      socialLinks: {
        linkedin: 'linkedin.com/in/mariembenammar',
        twitter: '@mariem_benammar',
      }
    },
    {
      name: 'Anas Benabdallah',
      username: 'anasbenabdallah',
      email: 'anas.benabdallah@email.tn',
      password: 'Password123!',
      ville: 'Bizerte',
      pays: 'Tunisie',
      bio: 'Développeur backend et administrateur systèmes. Spécialisé en Node.js et Docker.',
      role: UserRole.CREATOR,
      socialLinks: {
        github: 'github.com/anasba',
        linkedin: 'linkedin.com/in/anasbenabdallah',
      }
    },
    {
      name: 'Rania Ghanmi',
      username: 'raniaghanmi',
      email: 'rania.ghanmi@email.tn',
      password: 'Password123!',
      ville: 'Sfax',
      pays: 'Tunisie',
      bio: 'Copywriter et content strategist. Créatrice de contenus engageants pour marques.',
      role: UserRole.CREATOR,
      socialLinks: {
        instagram: 'raniawrites',
        linkedin: 'linkedin.com/in/raniaghanmi',
      }
    },
    {
      name: 'Hedi Mansouri',
      username: 'hedimansouri',
      email: 'hedi.mansouri@email.tn',
      password: 'Password123!',
      ville: 'Kasserine',
      pays: 'Tunisie',
      bio: 'Développeur frontend et créatif digital. Passionné par les animations et le design.',
      role: UserRole.CREATOR,
      socialLinks: {
        behance: 'behance.net/hedi',
        github: 'github.com/hedim',
      }
    },
    {
      name: 'Ines Ben Salem',
      username: 'inesbensalem',
      email: 'ines.bensalem@email.tn',
      password: 'Password123!',
      ville: 'Nabeul',
      pays: 'Tunisie',
      bio: 'Community Manager et créatrice de contenu. Experte en engagement communautaire.',
      role: UserRole.CREATOR,
      socialLinks: {
        instagram: 'inesbensalem_official',
        tiktok: '@inesbensalem',
      }
    },
    {
      name: 'Malek Dhahbi',
      username: 'malekdhahbi',
      email: 'malek.dhahbi@email.tn',
      password: 'Password123!',
      ville: 'Mahdia',
      pays: 'Tunisie',
      bio: 'Architecte cloud et DevOps. Passionné par larchitecture scalable et Kubernetes.',
      role: UserRole.CREATOR,
      socialLinks: {
        linkedin: 'linkedin.com/in/malekd',
        github: 'github.com/malekd',
      }
    },
    {
      name: 'Amira Zouari',
      username: 'amirazouari',
      email: 'amira.zouari@email.tn',
      password: 'Password123!',
      ville: 'Tunis',
      pays: 'Tunisie',
      bio: 'UX Researcher et coach en accessibilité numérique. Militante pour un web inclusif.',
      role: UserRole.CREATOR,
      socialLinks: {
        linkedin: 'linkedin.com/in/amirazouari',
        twitter: '@amira_ux',
      }
    },
    {
      name: 'Omar Laabidi',
      username: 'omarlaabidi',
      email: 'omar.laabidi@email.tn',
      password: 'Password123!',
      ville: 'Sousse',
      pays: 'Tunisie',
      bio: 'Product Manager et entrepreneur. Anciennement chez several startups tunisiennes.',
      role: UserRole.CREATOR,
      socialLinks: {
        linkedin: 'linkedin.com/in/omar-laabidi',
        twitter: '@omar_laabidi',
      }
    },
  ];

  async seedUsers() {
    const hashedPassword = await bcrypt.hash('Password123!', 10);

    for (const userData of this.tunisianUsers) {
      const user = new this.userModel({
        ...userData,
        password: hashedPassword,
        authProvider: AuthProvider.LOCAL,
        hasLocalPassword: true,
        createdAt: new Date(),
        joinedCommunities: [],
        createdCommunities: [],
        adminCommunities: [],
        moderatorCommunities: [],
        purchasedProducts: [],
        walletBalance: 0,
        totalPointsEarned: 0,
        twoFactorEnabled: false,
        isSuspended: false,
        accountStatus: 'active',
      });

      await user.save();
      console.log(`✅ Created user: ${userData.email}`);
    }

    console.log(`🎉 Successfully seeded ${this.tunisianUsers.length} Tunisian users!`);
  }
}
