# knemm
Knemm is a tool and library intended for DB schema administration and inspection, for relational 
(SQL) databases. It can be used both as a standalone CLI tool and as a Node.js dependency for an app 
that wants to manage its DB schema in a declarative way. It relies largely on the _Knex.js_ library
for connecting with and executing generated queries. 

# Claims
Knemm uses a declarative YAML (or JSON) syntax (termed a **claim**), specifying what tables should exist and what is expected of some of its columns. A claim gives a minimum requirement that a database (or a collection of other claims - a **state**) should satisfy. 

The basic part of this is called a **claim** and can look something like: 

```yaml
id:
  branch: Person
  version: 1
___tables:
    person:
        id:
            data_type: int
            is_primary_key: true
            has_auto_increment: true
        email:
            data_type: varchar
            max_length: 255
            is_unique: true 
        first_name:
            data_type: varchar
            max_length: 64
```

or equivalently in **hrc** format: 
```yaml
id: Person_1 
___tables:
    person:
        id: int pk auto
        email: varchar(255) unique
        first_name: varchar(64)
```

The first format is called **internal** and is always used when comparing, processing or merging claims. The second format - **hrc** - is used for compact notation. A claim can be converted back and forth between these two formats, without loss, so for practical purposes, they are interchangeable. (**hrc** stands for: *Human Readable - Compact form*.)



