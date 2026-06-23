import { 
  collection, 
  getDocs, 
  query, 
  where, 
  addDoc, 
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Restaurant, RestaurantProduct } from '../types';

const RESTAURANTS_COLLECTION = 'restaurants';
const PRODUCTS_COLLECTION = 'products';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function getRestaurants(): Promise<Restaurant[]> {
  try {
    const querySnapshot = await getDocs(collection(db, RESTAURANTS_COLLECTION));
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Restaurant));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, RESTAURANTS_COLLECTION);
    return [];
  }
}

export async function getRestaurantProducts(restaurantId: string): Promise<RestaurantProduct[]> {
  try {
    const q = query(collection(db, PRODUCTS_COLLECTION), where('restaurant_id', '==', restaurantId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as RestaurantProduct));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, PRODUCTS_COLLECTION);
    return [];
  }
}

export async function createRestaurant(restaurant: Omit<Restaurant, 'id'>) {
  try {
    return await addDoc(collection(db, RESTAURANTS_COLLECTION), {
      ...restaurant,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, RESTAURANTS_COLLECTION);
  }
}

export async function addProduct(product: Omit<RestaurantProduct, 'id'>) {
  try {
    return await addDoc(collection(db, PRODUCTS_COLLECTION), {
      ...product,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, PRODUCTS_COLLECTION);
  }
}
