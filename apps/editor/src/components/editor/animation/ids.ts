let counter = 0
/** A fresh effect id (unique within a slide, which is all the schema asks). */
export const newId = () => `fx${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`
