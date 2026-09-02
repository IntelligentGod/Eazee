export type WorkingHours = {
    isOpen: boolean;
    openTime?: string;
    closeTime?: string;
};

export type WeeklyAvailability = {
    [key in 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday']: WorkingHours;
};

export type User = {
    id?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phoneNumber?: string;
    country?: string;
    businessName: string;
    about?: string;
    website?: string;
    services?: string[];
    teamSize?: 'solo' | '2-5' | '6-10' | '11+';
    location?: string;
    latitude?: number;
    longitude?: number;
    completed?: boolean;
    rating?: number | null;
    reviewCount?: number | null;
    onboardingStep?: boolean;
    imageUrl?: string;
    availability?: WeeklyAvailability;
    photos?: string[];
    createdAt?: string;
    updatedAt: string;
};
