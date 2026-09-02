import { Timestamp } from 'firebase/firestore';

export interface Service {
  id: string;
  businessId: string;
  serviceName: string;
  duration: string;
  price: number;
  categoryId: string;  
  categoryName: string; 
  description?: string;
  isPackage?: boolean;
  packageServices?: string[]; 
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ServiceCategory {
  id: string;
  name: string;
  count: number;
  services: Service[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}