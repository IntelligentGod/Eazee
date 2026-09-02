import { Timestamp } from 'firebase/firestore';
import { Service } from './services';

export interface AppointmentService extends Pick<Service, 'id' | 'serviceName' | 'duration' | 'price'> {
    name: string;  
}

export interface Appointment {
    id?: string;
    businessId: string;
    clientId: string;
    clientName: string;
    staffId: string;
    staffName: string;
    services: AppointmentService[];
    startTime: Timestamp;
    endTime: Timestamp;
    totalDuration: number;
    totalPrice: number;
    status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no-show';
    createdAt: Timestamp;
    updatedAt: Timestamp;
}