export type ID = number

export type ApiErrorBody = {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export type ApiHealth = {
  ok: true
}

export type Product = {
  id: ID
  barcode: string
  name: string
  brand?: string | null
  image?: string | null
  createdAt?: string
}

export type ProductLookupRequest = {
  barcode: string
}

export type ProductLookupResponse = {
  found: boolean
  product?: Product
}

export type ProductCreateRequest = {
  name: string
  brand?: string | null
  barcode?: string
  image?: string | null
}

export type Location = {
  id: ID
  name: string
  householdId?: number | null
  createdAt?: string
}

export type LocationCreateRequest = {
  name: string
  householdId?: ID
}

export type LocationUpdateRequest = {
  name: string
}

export type Stock = {
  id: ID
  productId: ID
  locationId: ID
  quantity: number
  unit?: string | null
  mhd?: string | null
  householdId?: ID | null
  product?: Product
  location?: Location
  createdAt?: string
}

export type StockAddRequest = {
  productId?: ID
  barcode?: string
  locationId: ID
  quantity?: number
  unit?: string | null
  mhd?: string | null
  householdId?: ID
}

export type StockReduceRequest = {
  amount?: number
  toShopping?: boolean
  userId?: ID
}

export type StockReduceResponse = {
  ok: true
  deleted?: boolean
  updated?: Stock
}

export type StockMoveRequest = {
  fromStockId: ID
  toLocationId: ID
  amount?: number
}

export type OkResponse = {
  ok: true
}

export type ShoppingListItem = {
  id: ID
  productId: ID
  householdId: ID
  quantity: number
  note?: string | null
  unit?: string | null
  product?: Product
  addedBy?: UserPublic | null
  createdAt?: string
}

export type ShoppingListResponse = {
  items: ShoppingListItem[]
}

export type ShoppingListAddRequest = {
  productId?: ID
  name?: string
  note?: string | null
  quantity?: number
}

export type ShoppingListUpdateRequest = {
  quantity?: number
  note?: string | null
}

export type UserPublic = {
  id: ID
  email: string
  name?: string | null
  role?: string
  householdId?: ID | null
  image?: string | null
}

export type ProfileUpdateResponse = {
  ok: true
  image: string | null
}

export type RecipeAvailableItem = {
  id: ID
  name: string
  quantity: number
  unit?: string | null
}

export type RecipeGenerateRequest = {
  userInput?: string
}

export type RecipeGenerateResponse = {
  recipe: string
}

export type RecipeEmailRequest = {
  recipe: string
  subject?: string
}

export type InviteRequest = {
  email: string
}

export type RegisterRequest = {
  email: string
  password: string
  name?: string | null
  inviteToken?: string | null
}

export type RegisterResponse = {
  ok: true
  message: string
}
