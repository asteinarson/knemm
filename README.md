# knemm <!-- omit in toc -->
Knemm is a tool and library intended for DB schema administration, manipulation and inspection, for relational (SQL) databases. It can be used both as a standalone CLI tool and as a Node.js dependency
for an app that wants to manage its DB schema in a declarative way. It relies largely on the _Knex.js_ library for connecting with and executing generated queries. 

**STATUS:** `knemm` is still in early development. The most central concepts (claims, states, modules) and basic commands should remain stable. Features and details are very much still stabilizing. Feedback and contribution is welcome.  

## Contents <!-- omit in toc --> 
- [Installing](#installing)
    - [Via NPM](#via-npm)
    - [Via git repo](#via-git-repo)
    - [Launchers in package.json](#launchers-in-packagejson)
- [Claims](#claims)
    - [CLI Example](#cli-example)
  - [Claims on the same branch](#claims-on-the-same-branch)
    - [Same branch - Example](#same-branch---example)
  - [Claim invariability](#claim-invariability)
    - [Invariability - Example](#invariability---example)
  - [Claims used for migration](#claims-used-for-migration)
- [States](#states)
  - [The purpose of states](#the-purpose-of-states)
    - [Database to state - an example](#database-to-state---an-example)
  - [States and Databases](#states-and-databases)
- [Branches / modules](#branches--modules)
  - [An example - with modules](#an-example---with-modules)
    - [Why the reference properties ?](#why-the-reference-properties-)
  - [An e-commerce example - with modules](#an-e-commerce-example---with-modules)
    - [Person](#person)
    - [CatalogProduct](#catalogproduct)
    - [GroupPrice](#groupprice)
    - [QuoteOrder](#quoteorder)
    - [Tying it all together](#tying-it-all-together)

### Documentation 
This file is an overview, an introduction. For per topic documentation - [go here](docs/index.md).

# Installing  
### Via NPM 
Install with: 
```bash
$ npm i --global knemm
```
Now there should be two new commands available: 
 - `knemm`: This is the main command to manage DB schema. 
 - `knedb`: This is a companion command to handle/create/drop databases. 

Interfaces for PostgresQL (pg), MariaDB / MySQL and Sqlite3 are enabled by default in the package. 

### Via git repo
Clone this repository. Then run `npm install`. After that, build the TypeScript sources, using `tsc`. Then there should be a global command `knemm` available in the terminal. (Try `npm link` if NPM has not generated exec stubs).

### Launchers in package.json
`knemm` is compiled as an ESM module. Because of Node internals, it needs an extra launch step 
(via *bin* scripts in *package.json*). By default this goes via a Bash script. But it can also 
be launched via a JS launcher, through another bin script: `knemm_jsl` (which would work also 
under Windows).

# Claims
Knemm uses a declarative YAML (or JSON) syntax (termed a **claim**), specifying what tables should exist and what is expected of named columns. A claim gives a minimum requirement that a database (or a collection of other claims - a **state**) should satisfy. 

Here's what a claim, stored in a file `Person_1.yaml`, can look like: 
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
        id: int pk auto_inc
        email: varchar(255) unique
        first_name: varchar(64)
```

The first format is called **internal** and is always used internally when comparing, processing and merging claims. The second format - **hrc** - is used for compact notation - when reading / writing files. A correctly formed claim can be converted back and forth between these two formats, without loss, so for practical purposes, they are interchangeable. (**hrc** stands for: ***h**uman **r**eadable **c**ompact form*.)

### CLI Example
The first YAML source above will be processed (merged) by the command `join`: 
```shell
$ knemm join Person_1.yaml 
person:
  id: int pk auto_inc
  email: varchar(255) unique
  first_name: varchar(64)
```
The command reads the single input claim (in **internal** format), merged it into an empty state and printed it back in **hrc** format. Can we convert it back to internal form?  
```shell
$ knemm join Person_1.yaml | knemm join -i - 
person:
  ___owner: STDIN
  id:
    data_type: int
    is_primary_key: true
    has_auto_increment: true
  email:
    max_length: 255
    data_type: varchar
    is_unique: true
  first_name:
    max_length: 64
    data_type: varchar
```
Yes, we could, by piping the output to another `knemm`, specifying `-i` (generate output in internal format) - and specifying STDIN as the source for the claim (via the last **-**). Since the first command stripped away the claim ID, `knemm` has added `STDIN` as the ID of the claim. 

## Claims on the same branch
In the YAML above, your see that the ID of it is `Person_1`. Say that we want to add a column `second_name` to the table, then we can create a second claim: 

```yaml
id: Person_2 
___tables:
    person:
        second_name: varchar(64)
```

Claims on the same branch are always  merged sequentially, so a higher version number can do one or more of: 
  - Adding tables/columns to the branch
  - Modifying previously declared properties - in this branch
  - Dropping / removing tables (or columns) - also on the same branch

### Same branch - Example
We store below in a file `Person_2.yaml`: 
```yaml
person:
    second_name: varchar(64)
```
Then we can merge the two claims: 
```shell
$ knemm join Person_1.yaml Person_2.yaml 
person:
  id: int pk auto_inc
  email: varchar(255) unique
  first_name: varchar(64)
  second_name: varchar(64)
```
Actually we don't have to specify each claim it should use. It suffices that we specify *the highest versioned claim on each branch*: 
```shell
$ knemm join Person_2.yaml 
person:
   # ... same as above
```
`knemm` understands by itself that it should use `Person_1` as a dependency, if found. 

## Claim invariability 
The idea of putting changes in new (higher versioned) claim files (instead of just editing the previous claim file) is that the first claim might already be distributed and applied on existing databases. 

So one should really only edit a claim file **before** it has been deployed somewhere. 

### Invariability - Example 
We realize that some emails addresses can be very long. So we would like to have a `TEXT` column there, instead of the `VARCHAR`. We add a new claim - `Person_3.yaml`: 

```yaml
person:
    email: text
```
Then we can merge the two claims: 
```shell
$ knemm join Person_3.yaml 
person:
  id: int pk auto_inc
  email: text unique
  first_name: varchar(64)
  second_name: varchar(64)
```
As you see, we only modified the data type of `email`. The `unique` property was declared before, and it just remained there: 

>`knemm` aims at fulfilling each claim with the smallest possible modification.

## Claims used for migration
The `knemm` workflow just specifies what we want a certain part of the database to fulfill **at a given moment**. This differs from much schema management in which each migration step has two points:
  * Exactly what the database should be before - **A**
  * Exactly what the database is like after - **B**

>Now, claims in `knemm` say nothing about what the database should look like **before** the claim is tested and applied. If the database already fulfills the claim, then nothing is done. If say a column already exists (say as a `tinyint`) and the claim wants and `int`, then the column is widened. If the column is a `bigint`, then it more than fulfills the claim, and it is kept as such. 

A bit more formally, often in migration, this is the model:
  * Before: **A** === **DB state** 
  * After: **B** === **DB state** 

(With **A** being the outcome of the previous migration step, **B** the target of the current state).

With `knemm` it is relaxed/simplified to: 
  * After: **B** <= **DB state** 

With `knemm` we say that after applying the claim, the database satisifies that claim. 

# States
So far we have specified claims as inputs and had `knemm` check and merge them and then print the result to stdout. However, if we have an application, we likely want to store its DB schema more persistently. To achieve this, we can specify a state directory, via `-s` to `knemm`:
```shell
$ knemm join -s person-app Person_3.yaml 
# Same output as before 
$ ls person-app 
Person_1.yaml  Person_2.yaml  Person_3.yaml  ___merge.yaml
```
So we got a directory created and a file `___merge.yaml` created there. And each claim that was used to build it was copied here. You can inspect the generated file `___merge.yaml` in a text viewer. It contains the merge and a couple of internal properties has been added to it. Keep in mind: 
>`___merge.yaml` is automatically generated and should not be manually edited. 

Now if we (later) want to inspect a given state, we can run: 
```bash
$ knemm join -s person-app 
# ... we get the full table state printed out here
```

## The purpose of states
Maybe you see now that `knemm` primarily builds and manages JSON trees representing database requirements. Claims are usually not applied directly to databases. 

The key to why this works is that every database schema can be converted into a state (a YAML/JSON tree). And from there we can process, compare and generate diffs. These diffs can then be applied back on an actual DB.

### Database to state - an example
We start by creating a database, using the `knedb` helper (here a Postgres DB):
```bash 
$ knedb create me?my_pass@pg PersonTest
Database <PersonTest> on client type <pg> was created.
```
Then, in a PSQL prompt, run this SQL on the newly created DB:
```SQL
> CREATE TABLE person (id serial primary key, email text unique);
```
We exit PSQL. Then let's see that as a state: 
```bash
$ knemm join me?my_pass@pg:PersonTest
person:
  id: int pk auto_inc
  email: text
```

Since we now have two states, we can do a diff, from the DB to the target merge: 
```bash
$ knemm diff arst?15392holo@pg:PT1 ./person-app/
person:
  first_name:
    data_type: varchar
    max_length: 64
  second_name:
    max_length: 64
    data_type: varchar
```
In PSQL we never created the columns _first_name_, _second_name_, and `knemm` detects this, and generates the needed change as a diff (in **internal** format). 

>A **state** can refer to either a `___merge.yaml` stored in a state dir, or a state directly generated from a DB schema (as above), or as the output from a `knemm join` command.  

## States and Databases
It can be noted that a given DB can either lag behind the merge state, it can be in sync with it, or even ahead of it. None of these are **wrong**. They are just states and differences.

# Branches / modules
**Branch** and **module** mean the same thing. In terms of syntax it is simply the name put there in the claim ID. From the apps point of view, **module** is the better name, as what it allows for is to have several concurrent flows of migrations - representing loosely coupled software modules. 

One module (say **sales-order**) is the primary authority on the tables and columns it declares itself. But... it can depend on tables and columns from other modules (say **catalog-product**) and specify minimum database requirements it needs from that other module. 

`Knemm` will then check those requirements, and either the combination works out just fine, or it fails, and we get a clear error message when attempting to merge / apply a given claim. 

So we have a declarative way of letting loosely coupled software modules depend on each other, and to know beforehand if their database expectations will work out - or not. 

The two **'m'**:s in *Knemm* stands for - *multi-migrations*. That is, several connected flows of DB migrations, connected with dependency points and explicit schema expectations. 

## An example - with modules

Say we want to be able to classify persons in various groups (like `client`, `supplier`, `contractor`, ...). Obviously one group can have many persons, but say that for our example, a person can only be in one group. 
To demonstrate **module** functionality, we do this with a `person_group` module, that depends on `person`: 

```yaml
id: PersonGroup_1
depends: 
  Person: 
    ___version: 2   # We don't need anything from Person_3
    person:
      id: int pk     # We say we need 'int' at least, and they need to be primary keys
      first_name: varchar   # We say the name should be some string. We can accept any length.
      second_name: varchar  # Same
      email: unique         # Here 'email' is a typeless ref. We say we want it unique, that's all. 
    
___tables:
    # This is a new table of ours 
    group: 
      id: int pk auto_inc
      name: varchar(255)
    # A new field in an existing table
    person:
      group_id: int foreign_key(group,id)  # A new column, a foreign key, to the table declared above.
```
The exact requirements the module `PersonGroup` wants from `Person` are given under the **depends** section above. Then comes a new table (`group`) and we also declare our own column in the `person` table. 

We will implement this differently below, directly in the `person` module. Both approaches are valid, but since the functionality is quite generic, it fits well to implement it directly there.  

### Why the reference properties ? 
Above, we say the PersonGroup expects data types on columns in `Person` to be fulfilled (and some additional property). Why do we do this? After all the columns are declared in `Person_1` (or `Person_2`)?

Well, if the module `Person` later decides to modify or drop some of the columns that `PersonGroup` depends 
on, then we would not know of that - and fail at runtime. With explicitely saying exactly what one module 
wants from another one, we get a way to clearly and directly know of this, when the claim causing the issue 
is installed (upgraded) within the application. 

Actually, as long as another module has a reference on a column in another module, that module can only 
modify its column in minor ways - and it cannot drop it. 

## An e-commerce example - with modules
A bit more complex example is that of a simple e-commerce backend. It will consist of these loosely coupled modules:
  * `person`
  * `catalog_product`
  * `group_price`
  * `quote_order`
  
The `person` module does not need to know anything of e-commerce, it just is a table of simple person data - in our case for a customer. From the point of view of e-commerce, the only requirement is that has an unique **id** field, a **name** column and an **email** field. 

The `catalog_product` module in turn does not depend on the concept of persons or sales. In theory it could just be a simple database of products in categories. It doesn't "know" it is being used for sales. 

The `group_price` allows for setting different product prices for customers of groups (like private, retailer, contractor, ...). 

The `quote_order` module binds it all together. This module depends on (and builds on) all the previous ones. 

### Person
For `person` we can simply reuse our claims from above (_Person_1.yaml, Person_2.yaml, Person_3.yaml_). 

### CatalogProduct
For `catalog_product` we create the claim `CatalogProduct_1.yaml`:

```yaml
id: CatalogProduct_1 
___tables:
    category:
      id: int pk auto_inc
      name: varchar(255)
      parent_id: int foreign_key(category,id)  # The parent category ID
    product:
      id: int pk auto_inc
      sku: varchar(255) unique not_null
      name: varchar(255)
      price: double not_null
      category_id: int foreign_key(category,id)  # In what category the product is shown 
```

### GroupPrice
For `group_price` we want to create customer (`person`) groups, with labels. We want to expand the previous approach, and enable a person to belong to several groups (which requires a dedicated table). On closer thought, this is quite a generic concept, and it can be useful to implement it directly in the `Person` module. We make the 4:th claim in the `Person` module: 

```yaml
id: Person_4
___tables:
    group:
      id: int pk auto_inc
      name: varchar(255)
    person_group:
      person_id: int foreign_key(person,id)  # In this way, the person can be in 0,1 or 2+ groups 
      group_id: int foreign_key(group,id)  
```

For the group price, we do need our own module, since that functionality build on both the `Person`
and the `CatalogProduct` modules: 

```yaml
id: GroupPrice_1 

depends: 
  CatalogProduct: 
    ___version: 1
    # This is a table ref to CatalogProduct :
    product: # Below three columns are our explicit dependencies for products 
      id: int pk            # We need the ID to be unique integers 
      sku: varchar unique   # varchar (with no length) is the simplest string datatype. 
      price: float          # float is enough for us, it allows for double or decimal as well
  Person: 
    ___version: 4
    # We depend on the group table in Person: 
    group: # Below two columns are our explicit dependencies for the group functionality 
      id: int pk  
      name: varchar

___tables:
    # This is a table being declared in this module
    group_price:
      group_id: int foreign_key(group,id)
      product_id: int foreign_key(product,id)
      price: double not_null 
```

### QuoteOrder 
An order is an object tied to a customer (`person`) with order rows. Each such row refers to a product, it has a quantity field, and a `row_price` field. 

Quotes (or carts) are very similar to orders, only that they have not yet been placed. We can use a **boolean** flag for that. 
Here is an implementation: 

```yaml
id: QuoteOrder_1 

depends: 
  GroupPrice: 
    ___version: 1
    # QuoteOrder needs to access these fields in group_price:   
    group_price:
      group_id: int
      product_id: int
      price: double not_null 
    # Since Person is a dependency of GroupPrice, it is automatically pulled in:
    person: 
      id: int pk
    group: # Below two columns are our explicit dependencies for the group functionality 
      id: int pk  
      name: varchar
    # Since CatalogProduct is also a dependency of GroupPrice, it is automatically pulled in:
    product: 
      id: int pk 
      sku: varchar unique
      price: float

___tables:
    # These are tables being declared in this module 
    quote:
      id: int pk auto_inc  
      person_id: int foreign_key(person,id)
      email: text
      total_price: double 
      is_order: boolean     # This field separates placed orders from quotes 
      is_paid: boolean      # Payed or not ? 
      is_shipped: boolean   # Shipped or not ? 
    quote_item:
      quote_id: int foreign_key(quote,id)  # The quote that this row belongs to 
      product_sku: varchar(255)   # It is a reference to the product column, but we don't make it a FK
      qty: int not_null
      row_price: double 
```

### Tying it all together
Since the module dependencies are all expressed within **depends** sections, we can generate a state simply by giving the top-most claim: 
```bash 
$ knemm join -s ecomm-backend QuoteOrder_1.yaml 
# It generates the state to stdout ... 
$ ls ecomm-backend/ 
CatalogProduct_1.yaml  Person_1.yaml  Person_3.yaml  QuoteOrder_1.yaml
GroupPrice_1.yaml      Person_2.yaml  Person_4.yaml  ___merge.yaml
```

Let's create a database and generate this schema in it: 
```bash 
$ knedb create me?my_pass@pg:ecomm_backend :
Database <ecomm_backend> on client type <pg> was created.
$ knemm connect -s ecomm-backend/ me?my_pass@pg:ecomm_backend  
State in <ecomm-backend/> was connected to DB info in <me?my_pass@pg:ecomm_backend>
$ knemm apply -s ecomm-backend 
apply - DB synced with existing state
```

The `connect` command above associates a given state with a particular database (so we don't 
have to keep re-entering the database connection string). 

Lastly lets check in PSQL that the tables were generated: 
```bash 
$ psql 
psql (12.6 (Ubuntu 12.6-0ubuntu0.20.04.1))
Type "help" for help.

arst=# \c ecomm_backend 
You are now connected to database "ecomm_backend" as user "arst".
ecomm_backend=# \dt 
           List of relations
 Schema |     Name     | Type  | Owner 
--------+--------------+-------+-------
 public | category     | table | arst
 public | group        | table | arst
 public | group_price  | table | arst
 public | person       | table | arst
 public | person_group | table | arst
 public | product      | table | arst
 public | quote        | table | arst
 public | quote_item   | table | arst
(8 rows)

ecomm_backend=# 
``` 
And lets look at two of the created tables: 

```bash 
ecomm_backend-# \d+ group_price   
                                      Table "public.group_price"
   Column   |       Type       | Collation | Nullable | Default | Storage | Stats target | Description 
------------+------------------+-----------+----------+---------+---------+--------------+-------------
 group_id   | integer          |           |          |         | plain   |              | 
 product_id | integer          |           |          |         | plain   |              | 
 price      | double precision |           | not null |         | plain   |              | 
Foreign-key constraints:
    "group_price_group_id_foreign" FOREIGN KEY (group_id) REFERENCES "group"(id)
    "group_price_product_id_foreign" FOREIGN KEY (product_id) REFERENCES product(id)
Access method: heap

ecomm_backend-# \d+ quote_item   
                                           Table "public.quote_item"
   Column    |          Type          | Collation | Nullable | Default | Storage  | Stats target | Description 
-------------+------------------------+-----------+----------+---------+----------+--------------+-------------
 quote_id    | integer                |           |          |         | plain    |              | 
 product_sku | character varying(255) |           |          |         | extended |              | 
 qty         | integer                |           | not null |         | plain    |              | 
 row_price   | double precision       |           |          |         | plain    |              | 
Foreign-key constraints:
    "quote_item_quote_id_foreign" FOREIGN KEY (quote_id) REFERENCES quote(id)
Access method: heap
```

It looks like it worked ! 
