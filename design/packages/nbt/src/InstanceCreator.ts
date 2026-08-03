/**
 * An InstanceCreator is able to create a (default) instance of a certain type T
 */
export interface InstanceCreator<T> {
    create(): T;
}
