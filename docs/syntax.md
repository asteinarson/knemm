## [Back to docs](./index.md) <!-- omit in toc -->
This page goes through the core YAML/JSON syntax for database schema. 

## Contents <!-- omit in toc --> 
- [Table/column declaration syntax](#tablecolumn-declaration-syntax)
    - [Sufficient guarantee](#sufficient-guarantee)
  - [Negative properties (dropping)](#negative-properties-dropping)
    - [Dropping a foreign key property](#dropping-a-foreign-key-property)
  - [Column properties](#column-properties)
    - [Recreating a column](#recreating-a-column)
  - [Internal and Hrc formats](#internal-and-hrc-formats)
    - [Reading input claims](#reading-input-claims)
 
 
# Table/column declaration syntax
The tables that are being added (or modified) by a module are declared under the `___tables` key
at the top level: 
```yaml 
___tables:
  category:
    id:
      data_type: int
      is_primary_key: true
      has_auto_increment: true
      ...
```
We declare that there should exists a table `category` at least having a column `id` of type
**int** (or wider). That column should also be an auto incrementing primary key. 

When this claim is later compared to an actual database (with the `apply` command), `knemm` 
does one of: 
  * If the column does not exist, it creates it, exactly like in the claim
  * If the column already exists, it checks if it is compatible with what is being declared:
    * If, in the database, it has type **int** it is compatible
    * If it has type **bigint** it is also compatible (a **bigint** can contain any **int**)
    * If it has type **shortint** the column is expanded to an **int**. 
    * If it is of type **text**, **datetime**, ... then the column is incompatible (and applying the claim gives an error message)

In the case where the column already exists, it will accept any other column properties the 
column already had (say like **comment**). For the other properties declared in the claim 
(like **is_primary_key** and **has_auto_increment** above) - it will apply these properties
on the column, if they were not already there. 

### Sufficient guarantee 
One could say that the model of `knemm` is _sufficient compatibily_. It is similar to **interfaces** 
in many languages - a contract to have at least some capability. It puts a basic requirement to
fulfill, but allows it to be fulfilled over a wider range, with more precision than asked for. 

An example from a related domain is in the implementation of the type **boolean** in `MySQL`. 
When asked to create a **boolean** column it actually creates a **tinyint** column (8 bits
wide). However, this **tinyint** number can fulfill the **boolean** requirement (one bit) 
just fine. 

## Negative properties (dropping)
There is also the possibility for a claim to say that something (a table, a column, a property) 
should not exist: 
```yaml 
___tables:
  category:
    id:
      data_type: int
      # ...
    sku: "*NOT" 
```
We say that there should **not** be a column named `sku` in the table `category`. We can also 
do the same on a whole table: 

```yaml 
___tables:
  category:
    id:
      data_type: int
    # ...
  root_category: "*NOT" 
```
The logic of *fulfilling* is the similar here as for the positive claims: 
  * If the table (column / property) does not exist - then nothing is done 
  * If it exists, it is dropped 

### Dropping a foreign key property 
If we have a column `category_id` as a foreign key, we can just drop the key (and keep the column)
via: 
```yaml 
___tables:
  product:
    category_id:
      foreign_key: "*NOT*"
```

## Column properties
These are the basic column properties:
  * **data_type** - what type the column should at least be of:
    * Numbers: 
      * **bigint**, **int**, (~~**smallint**~~)
        * ~~**bigint_u**, **int_u**, (**smallint_u**~~)
 
      * **double**, **float**
      * **decimal**
    * strings: 
      * **varchar**, **text**
    * **boolean**
    * time/date:
      * **date**
      * **time**, **time_tz**
      * **timestamp**, **timestamp_tz**
  * others:
    * **json**, **jsonb**
    * **uuid**  
  * **is_primary_key**
  * **has_auto_increment**
  * **is_unique**
  * **is_nullable**
  * **default** - the default value of the column
  * **foreign_key** 
    * Being an object with subkeys: **table**, **column** 
  * **max_length** - for strings
  * **numeric_scale** - for **decimal**
  * **numeric_precision** - for **decimal**

### Recreating a column
If we fully want to recreate a column (rather than widen it) we can do that through:
  * A claim (say of version 5) does ***NOT** on the column (it then drops)
  * A claim (say of version 6) redeclares it

 
## Internal and Hrc formats
The syntax above (where each column property is its own key) is the basic form and is called **internal**. 

When composing claim files, another alternative exists, the **hrc** format (**H**uman **R**eadable **C**ompact). In this case, a column
can be declared as a string consisting of space separated words: 

```yaml 
___tables:
  category:
    id: int pk auto_inc
    ...
```
The substitution that happens is: 
  * the type is declared first, without qualifying it with **data_type**
  * A number of properties has a short form: 
    * **primary_key** => **pk** 
    * **has_auto_increment** => **auto_inc** 
    * **is_nullable** => !**not_null** 
      * Only columns which are not nullable must be declared so (the default is **is_nullable**)
    * **is_unique** => **unique** 
  * Properties with arguments are declared with parenthesis: 
    * **max_len(255)**
    * **numeric_scale(2)**
    * **foreign_key(product,sku)** 
      * The first arg is a table name, the second one is the column name  

### Reading input claims 
When reading a claim file, the two syntaxes may be mixed, also beween columns in the same table.

## [Back to docs](./index.md) <!-- omit in toc -->
