export type Gender = 'male' | 'female' | '';

export interface Client {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
    birthday: string;
    birthYear: string;
    gender: Gender;
    createdAt: Date;
}

export interface ClientFormData {
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
    birthday: string;
    birthYear: string;
    gender: Gender;
}