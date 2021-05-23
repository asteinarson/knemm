# knemm
Knemm is a tool and library intended for DB schema administration and inspection, for relational 
(SQL) databases. It can be used both as a standalone CLI tool and as a Node.js dependency for an app 
that wants to manage its DB schema in a declarative way. It relies largely on the _Knex.js_ library
for connecting with and executing generated queries. 

# Claims
Knemm uses a declarative YAML (or JSON) syntax (termed a **claim**), specifying what tables should exist and what is expected of specified columns. A claim gives a minimum requirement that a database (or a collection of other claims - a **state**) should satisfy. 

Here's what a claim can look like: 

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

The first format is called **internal** and is always used internally when comparing, processing and merging claims. The second format - **hrc** - is used for compact notation - when reading / writing files. A claim can be converted back and forth between these two formats, without loss, so for practical purposes, they are interchangeable. (**hrc** stands for: *Human Readable - Compact form*.)

## Claims on the same branch
In the YAML above, your see that the ID of it is `Person_1`. Say that we want to add a column `second_name` to the table, then we can create a second claim: 

```yaml
id: Person_2 
___tables:
    person:
        second_name: varchar(64)
```

Claims on the same branch are always merged sequentially, so a later version number can do either of: 
  - Adding tables/columns to the branch
  - Modifying previously declared properties - on the branch
  - Dropping / removing tables/columns - also on the same branch

## Claim invariability 
The idea of putting changes in new (higher versioned) claim files (instead of just editing the previous claim file) is that the first claim might already be distributed and applied on existing databases. 

So one should really only edit a claim file **before** it has been deployed somewhere.

# Branches / modules
**Branch** and **module** mean the same thing, it is simply the name put there in the claim ID. From the apps point of view, **module** is the better name, as what it allows for is to have several concurrent flows of migrations - representing loosely coupled software modules. 

One module (say **sales_order**) is the primary authority on the tables and columns it declares itself. But... it can depend on other modules (say **catalog_product**) and specify minimum database requirements it needs from that other module. 

Knemm will then check those requirements, and either the combination works out just fine, or it fails, and we get an error message when attempting to merge / apply the claims. 

So we have a declarative way of letting loosely coupled software modules depend on each other, and to know beforehand if the database expectations will work out - or not. 

The two **'m'**:s in *Knemm* stands for just that, *multi-migrations* (several connected flows of DB migrations connected with dependecy points and expectations). 

## Claim ID:s 

The ID is a name and a version number. The version number can be either an integer: 1, 3, 14, ... or a decimal number: 1.32, 1.33, 1.321, 2, 2.1... In ordinary situations, using integer numbers is enough. 

There can be holes between version numbers, so this if just these claims exist, it is just fine: 

  * Person_1 
  * Person_2 
  * Person_4
  * Person_7 

### Explicit / implicit claim ID:s
A claim ID can either be explicitely declared:
```yaml
id:
  branch: Person
  version: 4
```
or the ID can be contained in their filenames: 
```bash
$ ls Person*.yaml 
Person_1.yaml  Person_2.yaml  Person_4.yaml Person_7.yaml
```
In the latter case, one can omit the ID from the internal YAML - and optionally leave out the whole YAML/JSON top level, and end up with the content of 'Person_1.yaml' being: 
```yaml
person:
    id: int pk auto
    email: varchar(255) unique
    first_name: varchar(64)
```
So we then have a very compact way of expressing DB claims. 




