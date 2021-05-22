# knemm
Knex multi migration tool
Knemm is a tool and library intended for DB schema administration and inspection, for relational 
databases. It can be used both as a stabdalone CLI tool and as a Node.js dependency for an app 
that wants to manage its DB schema in a declarative way. It relies largely on the Knex.js library
for connecting with and executing queries. 

Knemm uses a declarative YAML (or JSON) syntax specifying what tables should exist and columns 
should behave. The basic part of this is called a *claim* and can look something like: 








