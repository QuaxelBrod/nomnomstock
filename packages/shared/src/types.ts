export type ID = number

export type Product = {
  id: ID
  barcode: string
  name: string
  brand?: string | null
  image?: string | null
  createdAt?: string
}

export type Location = {
  id: ID
  name: string
  householdId?: number | null
}

export type Stock = {
  id: ID
  productId: ID
  locationId: ID
  quantity: number
  unit?: string | null
  mhd?: string | null
}

export type ShoppingListItem = {
  id: ID
  productId: ID
  householdId: ID
  quantity: number
  note?: string | null
  unit?: string | null
}

export type UserPublic = {
  id: ID
  email: string
  name?: string | null
  role?: string
}
