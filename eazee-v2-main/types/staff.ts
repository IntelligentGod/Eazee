export interface TeamMember {
    id: string;
    businessId: string;
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber?: string;
    jobTitle?: string;
    country?: string;
    calendarColor?: string;
    shifts?: {
      [key: string]: {
        start: string;
        end: string;
      };
    };
  }