import { JdwpType, JdwpTypeTag } from "./JDWPConstants";

export type objectID = bigint | number;
export type threadID = objectID;
export type threadGroupID = objectID;
export type stringID = objectID;
export type classLoaderID = objectID;
export type classObjectID = objectID;
export type arrayID = objectID;
export type referenceTypeID = objectID;
export type classID = referenceTypeID;
export type interfaceID = referenceTypeID;
export type arrayTypeID = referenceTypeID;
export type methodID = bigint | number;
export type fieldID = bigint | number;
export type frameID = bigint | number;

export var fieldIDSize : number = 4;
export var methodIDSize : number = 4;
export var objectIDSize : number = 8;
export var referenceTypeIDSize : number = 8;
export var frameIDSize: number = 8;

export function setIDSizes(fieldId: number, methodId: number,
    objectId: number, referenceTypeId: number, frameId: number): void {
        fieldIDSize = fieldId;
        methodIDSize = methodId;
        objectIDSize = objectId;
        referenceTypeIDSize = referenceTypeId;
        frameIDSize = frameId;
}

export interface javaLocation
{
    tag : JdwpTypeTag;
    classId : classID;
    methodId : methodID;
    index : bigint;
}

export interface taggedObjectID
{
    tag : JdwpType;
    objectId : objectID;
}

export interface javaUntaggedValue
{
    //array
    A? : objectID;
    //byte
    B? : number;
    //char
    C? : number;
    //object 
    L? : objectID;
    //float
    F? : number;
    //double
    D? : bigint;
    //int
    I? : number;
    //long
    J? : bigint;
    //short 
    S? : number;
    //boolean
    Z? : boolean;
    //string object
    s? : objectID;
    //thread object
    t? : objectID;
    //threadgroup object
    g? : objectID;
    //classloader
    l? : objectID;
    //class object
    c? : objectID;
};

export interface javaValue
{
    tag : JdwpType;
    value : javaUntaggedValue;
}

export interface javaArrayregion
{
    tag : JdwpType;
    primitiveValues? : javaUntaggedValue[];
    objectValues? : javaValue[];
}

export class ReadBuffer
{
    protected index : number;
    protected buffer : Buffer;

    constructor(buf : Buffer)
    {
        this.index = 0;
        this.buffer = buf;
    }

    public readByte() : number
    {
        let res : number = this.buffer.readUInt8(this.index++);
        return res;
    }

    public readBoolean() : boolean
    {
        return (0 == this.readByte())?false:true;
    }

    public readFromBuffer() : Buffer
    {
        let len : number = this.readUIntBE();
        let res : Buffer =  Buffer.from(this.buffer, this.index, len);
        this.index += len;
        return res;
    }

    //big endian
    public readUShortBE() : number
    {
        let res : number = this.buffer.readUInt16BE(this.index);
        this.index += 2;
        return res;
    }

    public readShortBE() : number
    {
        let res : number = this.buffer.readInt16BE(this.index);
        this.index += 2;
        return res;
    }

    public readUIntBE() : number
    {
        let res : number = this.buffer.readUInt32BE(this.index);
        this.index += 4;
        return res;
    }

    public readIntBE() : number
    {
        let res : number = this.buffer.readInt32BE(this.index);
        this.index += 4;
        return res;
    }

    public readULongBE() : bigint
    {
        let res : bigint = this.buffer.readBigUInt64BE(this.index);
        this.index += 8;
        return res;
    }

    public readLongBE() : bigint
    {
        let res : bigint = this.buffer.readBigInt64BE(this.index);
        this.index += 8;
        return res;
    }

    //little endian
    public readUShortLE() : number
    {
        let res : number = this.buffer.readUInt16LE(this.index);
        this.index += 2;
        return res;
    }

    public readShortLE() : number
    {
        let res : number = this.buffer.readInt16LE(this.index);
        this.index += 2;
        return res;
    }

    public readUIntLE() : number
    {
        let res : number = this.buffer.readUInt32LE(this.index);
        this.index += 4;
        return res;
    }

    public readIntLE() : number
    {
        let res : number = this.buffer.readInt32LE(this.index);
        this.index += 4;
        return res;
    }

    public readULongLE() : bigint
    {
        let res : bigint = this.buffer.readBigUInt64LE(this.index);
        this.index += 8;
        return res;
    }

    public readLongLE() : bigint
    {
        let res : bigint = this.buffer.readBigInt64LE(this.index);
        this.index += 8;
        return res;
    }

    //read java type
    public readJavaString() : string
    {
        let len : number = this.readUIntBE();
        let res : string =  this.buffer.toString("utf-8", this.index, this.index + len);
        this.index += len;

        return res;
    }

    public readObjectId() : objectID
    {
        if (8 == objectIDSize)
        {
            return this.readULongBE();
        }

        return this.readUIntBE();
    }

    public readTaggedObjectId() : taggedObjectID
    {
        let res : taggedObjectID = {
            tag : this.readByte(), 
            objectId : this.readObjectId()
        };

        return res;
    }

    public readTaggedObjectIdArray() : taggedObjectID[]
    {
        let count : number = this.readUIntBE();
        let values: taggedObjectID[] = [];
        for (let i = 0; i < count; i++) {
            values.push(this.readTaggedObjectId());
        }

        return values;
    }

    public readThreadId() : threadID
    {
        return this.readObjectId();
    }

    public readThreadIdArray() : threadID[]
    {
        let count : number = this.readUIntBE();
        let values: threadID[] = [];
        for (let i = 0; i < count; i++) {
            values.push(this.readThreadId());
        }

        return values;
    }

    public readThreadGroupId() :threadGroupID
    {
        return this.readObjectId();
    }

    public readThreadGroupIdArray() :threadGroupID[]
    {
        let count : number = this.readUIntBE();
        let values: threadID[] = [];
        for (let i = 0; i < count; i++) {
            values.push(this.readThreadGroupId());
        }

        return values;
    }

    public readStringId() : stringID
    {
        return this.readObjectId();
    }

    public readClassLoaderId() : classLoaderID
    {
        return this.readObjectId();
    }

    public readClassObjectId() : classObjectID
    {
        return this.readObjectId();
    }

    public readArrayId() : arrayID
    {
        return this.readObjectId();
    }

    public readReferenceTypeId() : referenceTypeID
    {
        if (8 == referenceTypeIDSize)
        {
            return this.readULongBE();
        }

        return this.readUIntBE();
    }

    public readClassId() : classID
    {
        return this.readReferenceTypeId();
    }

    public readInterfaceId() : interfaceID
    {
        return this.readReferenceTypeId();
    }

    public readArrayTypeIDId() : arrayTypeID
    {
        return this.readReferenceTypeId();
    }

    public readMethodId() : methodID
    {
        if (8 == methodIDSize)
        {
            return this.readULongBE();
        }

        return this.readUIntBE();
    }

    public readFieldId() : fieldID
    {
        if (8 == fieldIDSize)
        {
            return this.readULongBE();
        }

        return this.readUIntBE();
    }

    public readFrameId() : frameID
    {
        if (8 == frameIDSize)
        {
            return this.readULongBE();
        }

        return this.readUIntBE();
    }

    public readLocation() : javaLocation
    {
        let res : javaLocation = {
            "tag" : this.readByte(),
            "classId" : this.readClassId(),
            "methodId" : this.readMethodId(),
            "index" : this.readULongBE()
        };

        return res;
    }

    public readValue() : javaValue
    {
        let tag : JdwpType = this.readByte();
        return {
            "tag" : tag,
            "value" : this.readUntaggedValue(tag),
        };
    }

    public readValueArray() : javaValue[]
    {
        let count : number = this.readUIntBE();
        let javaValues: javaValue[] = [];
        for (let i = 0; i < count; i++) {
            javaValues.push(this.readValue());
        }

        return javaValues;
    }

    public readUntaggedValue(tag : JdwpType) : javaUntaggedValue
    {
        switch (tag) {
            case JdwpType.JT_ARRAY:
                return {
                    "A" : this.readArrayId(),
                };
            case JdwpType.JT_BYTE:
                return {
                    "B" : this.readByte(),
                };
            case JdwpType.JT_CHAR:
                return {
                    "C" : this.readShortBE(),
                };
            case JdwpType.JT_OBJECT:
                return {
                    "L" : this.readObjectId(),
                };
            case JdwpType.JT_FLOAT:
                return {
                    "F" : this.readIntBE(),
                };
            case JdwpType.JT_DOUBLE:
                return {
                    "D" : this.readLongBE(),
                };
            case JdwpType.JT_INT:
                return {
                    "I" : this.readIntBE(),
                };
            case JdwpType.JT_LONG:
                return {
                    "J" : this.readLongBE(),
                };
            case JdwpType.JT_SHORT:
                return {
                    "S" : this.readShortBE(),
                };
            case JdwpType.JT_VOID:
                return {
                };
            case JdwpType.JT_BOOLEAN:
                return {
                    "Z" : this.readBoolean(),
                };
            case JdwpType.JT_STRING:
                return {
                    "s" : this.readStringId(),
                };
            case JdwpType.JT_THREAD:
                return {
                    "t" : this.readThreadId(),
                };
            case JdwpType.JT_THREAD_GROUP:
                return {
                    "g" : this.readThreadGroupId(),
                };
            case JdwpType.JT_CLASS_LOADER:
                return {
                    "l" : this.readClassId(),
                };
            case JdwpType.JT_CLASS_OBJECT:
                return {
                    "c" : this.readObjectId(),
                };
            default:
                throw("encounter invalid tag when read Value");
        }
    }

    public readUntaggedValueArray(tag : JdwpType, size : number) : javaUntaggedValue[]
    {
        let res : javaUntaggedValue[] = [];
        for (let i = 0; i < size; i++){
            res.push(this.readUntaggedValue(tag));
        }

        return res;
    }

    public readArrayregion() : javaArrayregion
    {
        let tag : JdwpType = this.readByte();
        if (JdwpType.JT_BOOLEAN == tag || 
            JdwpType.JT_BYTE == tag ||
            JdwpType.JT_CHAR == tag ||
            JdwpType.JT_FLOAT == tag ||
            JdwpType.JT_INT == tag ||
            JdwpType.JT_SHORT == tag || 
            JdwpType.JT_DOUBLE == tag ||
            JdwpType.JT_LONG == tag)
        {
            return {
                "tag" : tag,
                "primitiveValues" : this.readUntaggedValueArray(tag, this.readUIntBE()),
            };
        }
        else
        {
            return {
                "tag" : tag,
                "objectValues" : this.readValueArray(),
            };
        }
    }
}

export class WriteBuffer
{
    protected index : number;
    protected capacity : number;
    protected buffer : Buffer;
    protected expand : boolean;

    constructor(maxLen : number, expand : boolean = false)
    {
        this.index = 0;
        this.capacity = maxLen;
        this.expand = expand;
        this.buffer = Buffer.alloc(maxLen);
    }

    private checkLength(len : number) : void
    {
        if (this.index + len > this.capacity)
        {
            if (!this.expand)
            {
                throw("WriteBuffer:the buffer overflow.");
            }
            else
            {
                let older : Buffer = this.buffer;
                this.capacity *= 2;
                this.buffer = Buffer.alloc(this.capacity);
                older.copy(this.buffer,0, 0, this.index);

                this.checkLength(len);
            }
        }
    }

    public getDataBuffer() : Buffer
    {
        return this.buffer.slice(0, this.index);
    }

    public writeByte(value : number) : void 
    {
        this.checkLength(1);
        this.buffer.writeUInt8(value, this.index++);
    }

    public writeBoolean(value : boolean) : void
    {
        this.checkLength(1);
        this.buffer.writeUInt8(value?1:0, this.index++);
    }

    public writeBuffer(value : Buffer) : void{
        this.checkLength(value.length)
        value.copy(this.buffer, this.index);
        this.index += value.length;
    }

    ////big endian
    public writeUShortBE(value : number) : void
    {
        this.checkLength(2);
        this.buffer.writeUInt16BE(value, this.index);
        this.index += 2;
    }

    public writeShortBE(value : number) : void
    {
        this.checkLength(2);
        this.buffer.writeInt16BE(value, this.index);
        this.index += 2;
    }

    public writeUIntBE(value : number) : void
    {
        this.checkLength(4);
        this.buffer.writeUInt32BE(value, this.index);
        this.index += 4;
    }

    public writeUIntBEArray(values : number[]) : void
    {
        for (let i = 0; i < values.length; i++)
        {
            this.writeUIntBE(values[i]);
        }
    }

    public writeIntBE(value : number) : void
    {
        this.checkLength(4);
        this.buffer.writeInt32BE(value, this.index);
        this.index += 4;
    }

    public writeULongBE(value : bigint) : void
    {
        this.checkLength(8);
        this.buffer.writeBigUInt64BE(value, this.index);
        this.index += 8;
    }

    public writeLongBE(value : bigint) : void
    {
        this.checkLength(8);
        this.buffer.writeBigInt64BE(value, this.index);
        this.index += 8;
    }

    //little endian
    public writeUShortLE(value : number) : void
    {
        this.checkLength(2);
        this.buffer.writeUInt16LE(value, this.index);
        this.index += 2;
    }

    public writeShortLE(value : number) : void
    {
        this.checkLength(2);
        this.buffer.writeInt16LE(value, this.index);
        this.index += 2;
    }

    public writeUIntLE(value : number) : void
    {
        this.checkLength(4);
        this.buffer.writeUInt32LE(value, this.index);
        this.index += 4;
    }

    public writeIntLE(value : number) : void
    {
        this.checkLength(4);
        this.buffer.writeInt32LE(value, this.index);
        this.index += 4;
    }

    public writeULongLE(value : bigint) : void
    {
        this.checkLength(8);
        this.buffer.writeBigUInt64LE(value, this.index);
        this.index += 8;
    }

    public writeLongLE(value : bigint) : void
    {
        this.checkLength(8);
        this.buffer.writeBigInt64LE(value, this.index);
        this.index += 8;
    }

    //java type
    public writeJavaString(str : string) : void
    {
        this.writeUIntBE(str.length);
        this.checkLength(str.length);
        this.buffer.write(str, this.index, "utf-8");
        this.index += str.length;
    }

    public writeObjectId(value : objectID) : void
    {
        if (8 == objectIDSize && "bigint" == typeof(value))
        {
            this.writeULongBE(value);
        }
        else if (4 == objectIDSize && "number" == typeof(value))
        {
            this.writeUIntBE(value);
        }
        else
        {
            throw("objectIDSize or value type unvalid.");
        }
    }

    public writeObjectIdArray(values : objectID[]) : void
    {
        for (let i = 0; i < values.length; i++)
        {
            this.writeObjectId(values[i]);
        }
    }

    public writeTaggedObjectId(value : taggedObjectID) : void
    {
        this.writeByte(value.tag);
        this.writeObjectId(value.objectId);
    }

    public writeThreadId(value : threadID) : void
    {
        this.writeObjectId(value);
    }

    public writeThreadGroupId(value : threadGroupID) : void
    {
        this.writeObjectId(value);
    }

    public writeStringId(value : stringID) : void
    {
        this.writeObjectId(value);
    }

    public writeClassLoaderId(value : classLoaderID) : void
    {
        this.writeObjectId(value);
    }

    public writeClassObjectId(value : classObjectID) : void
    {
        this.writeObjectId(value);
    }

    public writeArrayId(value : arrayID) : void
    {
        this.writeObjectId(value);
    }

    public writeReferenceTypeId(value : referenceTypeID) : void
    {
        if (8 == referenceTypeIDSize && "bigint" == typeof(value))
        {
            this.writeULongBE(value);
        }
        else if (4 == referenceTypeIDSize && "number" == typeof(value))
        {
            this.writeUIntBE(value);
        }
        else
        {
            throw("referenceTypeIDSize or value type unvalid.");
        }
    }

    public writeReferenceTypeIdArray(values : referenceTypeID[]) : void
    {
        for (let i = 0; i < values.length; i++)
        {
            this.writeReferenceTypeId(values[i]);
        }
    }

    public writeClassId(value : classID) : void
    {
        this.writeReferenceTypeId(value);
    }

    public writeInterfaceId(value : interfaceID) : void
    {
        this.writeReferenceTypeId(value);
    }

    public writeArrayTypeIDId(value : arrayTypeID) : void
    {
        this.writeReferenceTypeId(value);
    }

    public writeMethodId(value : methodID) : void
    {
        if (8 == methodIDSize && "bigint" == typeof(value))
        {
            this.writeULongBE(value);
        }
        else if (4 == methodIDSize && "number" == typeof(value))
        {
            this.writeUIntBE(value);
        }
        else
        {
            throw("methodIDSize or value type unvalid.");
        }
    }

    public writeFieldId(value : fieldID) : void
    {
        if (8 == fieldIDSize && "bigint" == typeof(value))
        {
            this.writeULongBE(value);
        }
        else if (4 == fieldIDSize && "number" == typeof(value))
        {
            this.writeUIntBE(value);
        }
        else
        {
            throw("fieldIDSize or value type unvalid.");
        }
    }

    public writeFieldIdArray(values : fieldID[]) : void
    {
        for (let i = 0; i < values.length; i++)
        {
            this.writeFieldId(values[i]);
        }
    }

    public writeFrameId(value : frameID) : void
    {
        if (8 == frameIDSize && "bigint" == typeof(value))
        {
            this.writeULongBE(value);
        }
        else if (4 == frameIDSize && "number" == typeof(value))
        {
            this.writeUIntBE(value);
        }
        else
        {
            throw("frameIDSize or value type unvalid.");
        }
    }

    public writeLocation(value : javaLocation) : void
    {
        this.writeByte(value.tag);
        this.writeClassId(value.classId);
        this.writeMethodId(value.methodId);
        this.writeULongBE(value.index);
    }

    public writeValue(value : javaValue) : void 
    {
        this.writeByte(value.tag);
        this.writeUntaggedValue(value.value);
    }

    public writeValueArray(values : javaValue[]) : void
    {
        for (let i = 0; i < values.length; i++)
        {
            this.writeValue(values[i]);
        }
    }

    public writeUntaggedValue(value : javaUntaggedValue) : void 
    {
        if (undefined != value.A)
        {
            this.writeArrayId(value.A);
        }
        else if (undefined != value.B)
        {
            this.writeByte(value.B);
        }
        else if (undefined != value.C)
        {
            this.writeShortBE(value.C);
        }
        else if (undefined != value.L)
        {
            this.writeObjectId(value.L);
        }
        else if (undefined != value.F)
        {
            this.writeIntBE(value.F);
        }
        else if (undefined != value.D)
        {
            this.writeLongBE(value.D);
        }
        else if (undefined != value.I)
        {
            this.writeIntBE(value.I);
        }
        else if (undefined != value.J)
        {
            this.writeLongBE(value.J);
        }
        else if (undefined != value.S)
        {
            this.writeShortBE(value.S);
        }
        else if (undefined != value.Z)
        {
            this.writeBoolean(value.Z);
        }
        else if (undefined != value.s)
        {
            this.writeStringId(value.s);
        }
        else if (undefined != value.t)
        {
            this.writeThreadId(value.t);
        }
        else if (undefined != value.g)
        {
            this.writeThreadGroupId(value.g);
        }
        else if (undefined != value.l)
        {
            this.writeClassLoaderId(value.l);
        }
        else if (undefined != value.c)
        {
            this.writeObjectId(value.c);
        }
    }

    public writeUntaggedValueArray(values : javaUntaggedValue[]) : void 
    {
        for (let i = 0; i < values.length; i++)
        {
            this.writeUntaggedValue(values[i]);
        }
    }

    public writeArrayregion(value : javaArrayregion) : void
    {
        let tag : JdwpType = value.tag;
        if (JdwpType.JT_BOOLEAN == tag || 
            JdwpType.JT_BYTE == tag ||
            JdwpType.JT_CHAR == tag ||
            JdwpType.JT_FLOAT == tag ||
            JdwpType.JT_INT == tag ||
            JdwpType.JT_SHORT == tag || 
            JdwpType.JT_DOUBLE == tag ||
            JdwpType.JT_LONG == tag)
        {
            if (value.primitiveValues)
            {
                this.writeByte(value.tag);
                this.writeUIntBE(value.primitiveValues.length);
                this.writeUntaggedValueArray(value.primitiveValues);
            }
            else
            {
                throw("please support valid array values.");
            }
        }
        else
        {
            if (value.objectValues)
            {
                this.writeByte(value.tag);
                this.writeUIntBE(value.objectValues.length);
                this.writeValueArray(value.objectValues);
            }
            else
            {
                throw("please support valid array values.");
            }
        }
    }
}
