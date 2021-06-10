## [Back to index](index.md)

# possible 
**The possible command is still preliminary!** 
```
knemm possible  [options] <candidate> <target>
```
The command checks if is possible to go from one state (or claim) - the **candidate** - to 
another one - the **target**. 

If it is possible, the command echoes back `Possible`. 

If it not is possible, the command echoes back `Not possible`. 

Different reasons why going from one state to another one is not possible include: 

  * The two describe the same column with conflicting data types.
    * I.e. an `int` column cannot be trivially changed to a `varchar` or `datetime` column
  * One of them says that a column (or a table) should not exist. The other one says it should (with certain properties)


## Options

The options are mostly the same as for the [join command](join.md). 

