# knemm <!-- omit in toc -->
Knemm is a tool and library intended for DB schema administration, manipulation and inspection, for relational (SQL) databases. It can be used both as a standalone CLI tool and as a Node.js dependency
for an app that wants to manage its DB schema in a declarative way. It relies largely on the _Knex.js_ library for connecting with and executing generated queries. 

**STATUS:** `knemm` is still in early development. The most central concepts (claims, states, modules) and basic commands should remain stable. Features and details are very much still stabilizing. Feedback and contribution is welcome.  

## Contents <!-- omit in toc --> 
- [Installing](#installing)
    - [Via NPM](#via-npm)
    - [Via git repo](#via-git-repo)
- [Claims](#claims)
    - [CLI Example](#cli-example)
  - [Claims on the same branch](#claims-on-the-same-branch)
    - [Same branch - Example](#same-branch---example)
  - [Claim invariability](#claim-invariability)
    - [Invariability - Example](#invariability---example)
  - [Claims used for migration](#claims-used-for-migration)
  - [Claim ID:s](#claim-ids)
    - [Explicit / implicit claim ID:s](#explicit--implicit-claim-ids)
- [States](#states)
  - [The purpose of states](#the-purpose-of-states)
    - [Database to state - an example](#database-to-state---an-example)
  - [States and Databases](#states-and-databases)
- [Branches / modules](#branches--modules)

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
Clone this repository (to a Linux/Unix host). Then run `npm install`. After that, build the TypeScript sources, using `tsc`. Then there should be a global command `knemm` available in the terminal. (Try `npm link` if NPM has not generated exec stubs).

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
The command read the single input claim (in **internal** format), merged it into an empty state and printed it back in **hrc** format. Can we convert it back to internal form?  
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
Actually we don't have to specify each claim it should use. It suffices that we specifies *the highest versioned claim on each branch*: 
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

With `knemm` it is relaxed/simplified to: 
  * After: **B** <= **DB state** 

(With **A** being the outcome of the previous migration step, **B** the target of the current state).

## Claim ID:s 

The ID is a name and a version number. The version number can be either an integer: 1, 3, 14, ... or a decimal number: 1.32, 1.33, 1.321, 1.5, 2, 2.1... In ordinary situations, using integer numbers is enough. 

There can be holes between version numbers, so this if just these claims exist, it is just fine: 

  * Person_1 
  * Person_2 
  * Person_4
  * Person_7 

### Explicit / implicit claim ID:s
A claim ID can either be explicitly declared:
```yaml
id:
  branch: Person
  version: 4
```
or the ID can be contained in their filenames: 
```shell
$ ls Person*.yaml 
Person_1.yaml  Person_2.yaml  Person_4.yaml Person_7.yaml
```
In the latter case, one can omit the ID from the internal YAML - and optionally leave out the whole YAML/JSON top level, and end up with the content of `Person_1.yaml` being: 
```yaml
person:
    id: int pk auto_inc
    email: varchar(255) unique
    first_name: varchar(64)
```
The file just contains the **___tables** section. So we then have a very compact way of expressing DB claims. 

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
**Branch** and **module** mean the same thing, it is simply the name put there in the claim ID. From the apps point of view, **module** is the better name, as what it allows for is to have several concurrent flows of migrations - representing loosely coupled software modules. 

One module (say **sales-order**) is the primary authority on the tables and columns it declares itself. But... it can depend on tables and columns from other modules (say **catalog-product**) and specify minimum database requirements it needs from that other module. 

Knemm will then check those requirements, and either the combination works out just fine, or it fails, and we get an error message when attempting to merge / apply the claims. 

So we have a declarative way of letting loosely coupled software modules depend on each other, and to know beforehand if their database expectations will work out - or not. 

The two **'m'**:s in *Knemm* stands for just that - *multi-migrations*. That is, several connected flows of DB migrations, connected with dependency points and explicit schema expectations. 





